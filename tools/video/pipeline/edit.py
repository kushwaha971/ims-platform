"""edit.py — turn recorded chapters + narration into the final video.

    python3 edit.py <video> [--only m04,m05] [--out NAME]

Inputs (all under build/<video>/):
  narration.json      chapters/segments (export.mjs, from the story)
  durations.json      per-segment WAV seconds (tts.py)
  audio/<seg>.wav     48 kHz mono narration per segment (tts.py)
  rec/<ch>/frames.json + marks.json + fNNNNNN.jpg   (record.mjs)

Per chapter it builds a TITLE CARD clip (card segments narrated over it) and a
RECORDING clip (frames -> constant 30 fps; each segment's WAV placed at the
wall-clock mark where its on-screen action started, so audio and video cannot
drift). Clips are concatenated with short fades, then ONE final pass burns in
captions (Noto Sans, ASS/libass), applies two-pass EBU R128 loudnorm and
encodes H.264 + AAC. Also writes the SRT, YouTube chapter list and a review
contact sheet.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import subprocess
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "pipeline" / "assets"  # yourkhata-lockup.png: K-c "Bandhan" (repo c159f69), rasterised by work/rasterize.mjs
FONT_DIR = Path("/usr/share/fonts/truetype/noto")
FONT_REG = str(FONT_DIR / "NotoSans-Regular.ttf")
FONT_BOLD = str(FONT_DIR / "NotoSans-Bold.ttf")
FONT_SEMI = str(FONT_DIR / "NotoSans-SemiBold.ttf") if (FONT_DIR / "NotoSans-SemiBold.ttf").exists() else FONT_BOLD
FPS = 30
BRAND = (74, 71, 214)       # indigo primary (#4A47D6)
BRAND_DARK = (40, 36, 140)
ACCENT = (255, 184, 0)

LAYOUT = {
    # Phone screen (780x1688 device px) scaled to 740x1602 on a 1080x1920 canvas;
    # the caption band sits BELOW the screen so the bottom nav/actions stay visible.
    "mobile": dict(W=1080, H=1920, screen=(740, 1602), sx=170, sy=38, radius=46,
                   cap_top=1668, cap_bottom=1900, cap_size=44, cap_width=36, card_cap_width=34, max_lines=3, label_size=34),
    # 16:9 YouTube; captions overlay the bottom in a translucent box.
    "desktop": dict(W=1920, H=1080, screen=(1920, 1080), sx=0, sy=0, radius=0,
                    cap_top=None, cap_bottom=1040, cap_size=40, cap_width=62, card_cap_width=56, max_lines=2, label_size=30),
}


def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode:
        raise RuntimeError(f"{' '.join(map(str, cmd[:8]))} ...\n{r.stderr[-2500:]}")
    return r


def probe_dur(p: Path) -> float:
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)]).stdout)


# ── images: background, screen mask, cards ────────────────────────────────────
def font(path, size):
    return ImageFont.truetype(path, size)


def gradient(W, H, top=BRAND, bottom=BRAND_DARK):
    img = Image.new("RGB", (W, H), top)
    px = img.load()
    for y in range(H):
        t = y / (H - 1)
        c = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
        for x in range(W):
            px[x, y] = c
    return img


def mobile_background(L, out: Path):
    W, H = L["W"], L["H"]
    bg = gradient(W, H, (238, 238, 252), (222, 222, 246))
    d = ImageDraw.Draw(bg)
    sw, sh = L["screen"]
    x0, y0 = L["sx"], L["sy"]
    # soft shadow + dark bezel around the screen
    sh_img = Image.new("L", (W, H), 0)
    ImageDraw.Draw(sh_img).rounded_rectangle([x0 - 14, y0 - 6, x0 + sw + 14, y0 + sh + 22], L["radius"] + 14, fill=120)
    sh_img = sh_img.filter(ImageFilter.GaussianBlur(18))
    bg.paste((60, 60, 90), (0, 0), sh_img)
    d.rounded_rectangle([x0 - 10, y0 - 10, x0 + sw + 10, y0 + sh + 10], L["radius"] + 10, fill=(24, 24, 32))
    bg.save(out)


def mobile_mask(L, out: Path):
    """RGBA overlay the size of the canvas: opaque bezel colour outside the rounded screen."""
    W, H = L["W"], L["H"]
    sw, sh = L["screen"]
    m = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    hole = Image.new("L", (W, H), 255)
    ImageDraw.Draw(hole).rounded_rectangle([L["sx"], L["sy"], L["sx"] + sw, L["sy"] + sh], L["radius"], fill=0)
    # only the thin ring between the screen corners and the bezel is painted
    ring = Image.new("L", (W, H), 0)
    ImageDraw.Draw(ring).rectangle([L["sx"] - 2, L["sy"] - 2, L["sx"] + sw + 2, L["sy"] + sh + 2], fill=255)
    alpha = Image.fromarray(__import__("numpy").minimum(__import__("numpy").array(hole), __import__("numpy").array(ring)))
    m.paste((24, 24, 32, 255), (0, 0), alpha)
    m.save(out)


def wrap_px(draw, text, fnt, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=fnt) <= max_w or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def render_card(card: dict, W: int, H: int, out: Path, *, step_no: str | None = None):
    img = gradient(W, H)
    d = ImageDraw.Draw(img)
    portrait = H > W
    s = W / 1080 if portrait else H / 1080
    # decorative khata ruling
    for i in range(0, H, int(64 * s)):
        d.line([(0, i), (W, i)], fill=(86, 83, 222), width=1)
    d.line([(int(120 * s), 0), (int(120 * s), H)], fill=(230, 90, 90), width=max(2, int(3 * s)))
    margin = int(170 * s) if portrait else int(260 * s)
    y = int(H * (0.30 if portrait else 0.26))
    kicker_raw = card.get("kicker") or "YourKhata"
    lock = Image.open(ASSETS / "yourkhata-lockup.png").convert("RGBA")
    if kicker_raw == "YourKhata":
        # Intro / outro card: the K-c "Bandhan" lockup, large, on a white panel.
        lw = int((620 if portrait else 700) * s)
        lk = lock.resize((lw, int(lw * lock.height / lock.width)), Image.LANCZOS)
        pad = int(34 * s)
        py = int(H * (0.16 if portrait else 0.10))
        d.rounded_rectangle([margin - pad, py - pad, margin + lk.width + pad, py + lk.height + pad], int(36 * s), fill="white")
        img.paste(lk, (margin, py), lk)
        y = max(y, py + lk.height + pad + int(90 * s))
    else:
        # Step card: small lockup top-right on a white pill.
        lw = int(300 * s)
        lk = lock.resize((lw, int(lw * lock.height / lock.width)), Image.LANCZOS)
        pad = int(16 * s)
        x0 = W - int(60 * s) - lk.width
        d.rounded_rectangle([x0 - pad, int(50 * s) - pad, x0 + lk.width + pad, int(50 * s) + lk.height + pad], int(22 * s), fill="white")
        img.paste(lk, (x0, int(50 * s)), lk)
    fk = font(FONT_BOLD, int(46 * s))
    kicker = kicker_raw.upper()
    if kicker_raw != "YourKhata":  # the lockup above already names the product
        d.rounded_rectangle([margin, y, margin + d.textlength(kicker, font=fk) + int(48 * s), y + int(78 * s)], int(39 * s), fill=ACCENT)
        d.text((margin + int(24 * s), y + int(10 * s)), kicker, font=fk, fill=(30, 26, 90))
        y += int(130 * s)
    ft = font(FONT_BOLD, int((92 if portrait else 96) * s))
    for line in wrap_px(d, card["title"], ft, W - margin - int(80 * s)):
        d.text((margin, y), line, font=ft, fill="white")
        y += int((116 if portrait else 118) * s)
    if card.get("sub"):
        y += int(24 * s)
        fs = font(FONT_REG, int(50 * s))
        for line in wrap_px(d, card["sub"], fs, W - margin - int(80 * s)):
            d.text((margin, y), line, font=fs, fill=(222, 222, 255))
            y += int(68 * s)
    img.save(out)


# ── captions ──────────────────────────────────────────────────────────────────
def ass_time(t):
    t = max(0, t)
    h, m = int(t // 3600), int(t % 3600 // 60)
    s = t - h * 3600 - m * 60
    return f"{h}:{m:02d}:{s:05.2f}"


def srt_time(t):
    t = max(0, t)
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms % 3600000 // 60000:02d}:{ms % 60000 // 1000:02d},{ms % 1000:03d}"


def split_caption(text: str, width: int, max_lines: int = 2):
    """Split a caption into screens of <= max_lines lines, on sentence/clause ends when possible."""
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    screens, cur = [], ""
    for p in parts:
        t = (cur + " " + p).strip()
        if len(textwrap.wrap(t, width)) <= max_lines:
            cur = t
        else:
            if cur:
                screens.append(cur)
            # a single clause that is still too long: hard-wrap it
            lines = textwrap.wrap(p, width)
            while len(lines) > max_lines:
                screens.append(" ".join(lines[:max_lines]))
                lines = lines[max_lines:]
            cur = " ".join(lines)
    if cur:
        screens.append(cur)
    return screens


def caption_events(text, start, dur, width, style="Cap", max_lines=2):
    screens = split_caption(text, width, max_lines)
    total = sum(len(s) for s in screens) or 1
    t, ev = start, []
    for s in screens:
        d = dur * len(s) / total
        ev.append((t, t + d, textwrap.wrap(s, width), style))
        t += d
    return ev


def write_ass(events, labels, L, path: Path, raw=()):
    W, H = L["W"], L["H"]
    size = L["cap_size"]
    portrait = H > W
    if portrait:
        # band below the phone: white text on the canvas, no box needed
        cap_style = f"Style: Cap,Noto Sans,{size},&H00202040,&H00202040,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,0,0,1,0,0,2,60,60,{H - L['cap_bottom']},1"
    else:
        cap_style = f"Style: Cap,Noto Sans,{size},&H00FFFFFF,&H00FFFFFF,&H64000000,&H64000000,-1,0,0,0,100,100,0,0,3,14,0,2,200,200,{H - L['cap_bottom']},1"
    card_style = f"Style: CapCard,Noto Sans,{size},&H00FFFFFF,&H00FFFFFF,&H78200A1E,&H78200A1E,-1,0,0,0,100,100,0,0,3,16,0,2,{60 if portrait else 200},{60 if portrait else 200},{int(H * 0.08)},1"
    label_style = f"Style: Label,Noto Sans,{L['label_size']},&H00FFFFFF,&H00FFFFFF,&H00D6474A,&H00D6474A,-1,0,0,0,100,100,0,0,3,12,0,7,40,40,30,1"
    lines = [
        "[Script Info]", "ScriptType: v4.00+", f"PlayResX: {W}", f"PlayResY: {H}", "WrapStyle: 2", "ScaledBorderAndShadow: yes", "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        cap_style, card_style, label_style,
        "Style: Draw,Noto Sans,20,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1", "",
        "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    for a, b, ls, st in events:
        lines.append(f"Dialogue: 0,{ass_time(a)},{ass_time(b)},{st},,0,0,0,,{{\\fad(120,120)}}" + "\\N".join(x.replace("{", "(").replace("}", ")") for x in ls))
    for a, b, text in labels:
        if portrait:
            continue  # the phone has no spare margin; the title card already names the chapter
        lines.append(f"Dialogue: 1,{ass_time(a)},{ass_time(b)},Label,,0,0,0,,{{\\fad(250,250)\\an7\\pos(28,24)}} {text} ")
    lines += list(raw)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ── post-rendered desktop cursor (30 fps, from the recorder's logged moves) ──
ARROW = "m 0 0 l 0 34 l 9 26 l 15 40 l 21 37 l 15 24 l 27 24"
CIRCLE = "m 0 -24 b 13 -24 24 -13 24 0 b 24 13 13 24 0 24 b -13 24 -24 13 -24 0 b -24 -13 -13 -24 0 -24"


def cursor_events(marks, base_ms, t_off, total, scale, stage0, start_xy):
    """ASS lines for the cursor: halo + arrow, \\move for glides, ripple on clicks."""
    ev, cam = [], stage0
    x, y = start_xy
    t = 0.0
    segs = []  # (t0, t1, x0, y0, x1, y1)
    for m in marks:
        tm = (m["t"] - base_ms) / 1000
        if m["kind"] == "camera":
            segs.append((t, max(t, tm), x, y, x, y))
            cam, x, y, t = m["key"], m.get("x", x), m.get("y", y), max(t, tm)
        elif m["kind"] == "move" and m.get("stage", cam) == cam:
            ts = max(t, tm - m["dt"] / 1000)
            segs.append((t, ts, x, y, x, y))
            segs.append((ts, max(ts + 0.04, tm), m["x0"], m["y0"], m["x1"], m["y1"]))
            x, y, t = m["x1"], m["y1"], max(ts + 0.04, tm)
        elif m["kind"] == "click" and m.get("stage", cam) == cam:
            cx, cy = m["x"] * scale, m["y"] * scale
            ev.append(f"Dialogue: 7,{ass_time(t_off + tm)},{ass_time(t_off + tm + 0.7)},Draw,,0,0,0,,"
                      f"{{\\an5\\pos({cx:.0f},{cy:.0f})\\p1\\1a&HFF&\\3c&H0090FF&\\bord5\\fscx60\\fscy60\\t(0,650,\\fscx230\\fscy230\\alpha&HFF&)}}{CIRCLE}{{\\p0}}")
    segs.append((t, total, x, y, x, y))
    for a, b, x0, y0, x1, y1 in segs:
        if b - a < 0.01:
            continue
        A, B = ass_time(t_off + a), ass_time(t_off + b)
        if (x0, y0) == (x1, y1):
            pos = f"\\pos({x0 * scale:.0f},{y0 * scale:.0f})"
        else:
            pos = f"\\move({x0 * scale:.0f},{y0 * scale:.0f},{x1 * scale:.0f},{y1 * scale:.0f},0,{int((b - a) * 1000)})"
        ev.append(f"Dialogue: 5,{A},{B},Draw,,0,0,0,,{{\\an5{pos}\\p1\\bord0\\1c&H00B8FF&\\1a&H90&}}{CIRCLE}{{\\p0}}")
        ev.append(f"Dialogue: 6,{A},{B},Draw,,0,0,0,,{{\\an7{pos}\\p1\\bord2.5\\1c&H101010&\\3c&HFFFFFF&}}{ARROW}{{\\p0}}")
    return ev


# ── clips ─────────────────────────────────────────────────────────────────────
def silence(sec, out: Path):
    run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", f"{sec:.3f}", str(out)])


def mix_audio(placements, total, out: Path):
    """placements: [(wav, offset_s)] -> one mono 48 kHz WAV of length `total`."""
    if not placements:
        silence(total, out)
        return
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-t", f"{total:.3f}", "-i", "anullsrc=r=48000:cl=mono"]
    for w, _ in placements:
        cmd += ["-i", str(w)]
    parts = []
    for i, (_, off) in enumerate(placements, start=1):
        ms = max(0, int(round(off * 1000)))
        parts.append(f"[{i}:a]adelay={ms}:all=1[a{i}]")
    ins = "[0:a]" + "".join(f"[a{i}]" for i in range(1, len(placements) + 1))
    parts.append(f"{ins}amix=inputs={len(placements) + 1}:normalize=0:duration=first[m]")
    cmd += ["-filter_complex", ";".join(parts), "-map", "[m]", "-ac", "1", "-ar", "48000", str(out)]
    run(cmd)


ENC = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-pix_fmt", "yuv420p", "-r", str(FPS),
       "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "1"]


def card_clip(img: Path, wav: Path, dur: float, out: Path, fade=0.35):
    run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", str(FPS), "-t", f"{dur:.3f}", "-i", str(img), "-i", str(wav),
         "-vf", f"zoompan=z='min(1.0+0.0004*on,1.04)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={Image.open(img).size[0]}x{Image.open(img).size[1]}:fps={FPS},"
                f"fade=t=in:st=0:d={fade},fade=t=out:st={max(0, dur - fade):.3f}:d={fade}",
         "-af", f"afade=t=in:d=0.05,afade=t=out:st={max(0, dur - 0.05):.3f}:d=0.05", "-t", f"{dur:.3f}", *ENC, str(out)])


def rec_clip(ch_dir: Path, wav: Path, L, kind, bg: Path | None, mask: Path | None, out: Path, fade=0.3):
    fr = json.loads((ch_dir / "frames.json").read_text())
    frames = fr["frames"]
    t_first = frames[0]["t"]
    total = (fr["tEnd"] - t_first) / 1000
    lst = ch_dir / "frames.txt"
    with lst.open("w") as f:
        for i, x in enumerate(frames):
            nxt = frames[i + 1]["t"] if i + 1 < len(frames) else fr["tEnd"]
            f.write(f"file '{x['file']}'\nduration {max(0.001, (nxt - x['t']) / 1000):.4f}\n")
        f.write(f"file '{frames[-1]['file']}'\n")
    W, H = L["W"], L["H"]
    sw, sh = L["screen"]
    if kind == "mobile":
        flt = (f"[0:v]fps={FPS},scale={sw}:{sh}:flags=lanczos,setsar=1[s];[1:v][s]overlay={L['sx']}:{L['sy']}[b];"
               f"[b][2:v]overlay=0:0,format=yuv420p,fade=t=in:st=0:d={fade},fade=t=out:st={max(0, total - fade):.3f}:d={fade}[v]")
        inputs = ["-f", "concat", "-safe", "0", "-i", str(lst), "-loop", "1", "-i", str(bg), "-loop", "1", "-i", str(mask)]
        amap = "3:a"
    else:
        flt = (f"[0:v]fps={FPS},scale={W}:{H}:flags=lanczos,setsar=1,format=yuv420p,"
               f"fade=t=in:st=0:d={fade},fade=t=out:st={max(0, total - fade):.3f}:d={fade}[v]")
        inputs = ["-f", "concat", "-safe", "0", "-i", str(lst)]
        amap = "1:a"
    run(["ffmpeg", "-v", "error", "-y", *inputs, "-i", str(wav), "-filter_complex", flt, "-map", "[v]", "-map", amap,
         "-t", f"{total:.3f}", *ENC, str(out)])
    return total, t_first


# ── main ──────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--only", default="")
    ap.add_argument("--out", default=None)
    ap.add_argument("--gap", type=float, default=0.45, help="silence between card segments")
    a = ap.parse_args()

    B = ROOT / "build" / a.video
    nar = json.loads((B / "narration.json").read_text())
    durs = json.loads((B / "durations.json").read_text())
    kind = "mobile" if nar["meta"]["profile"] == "mobile" else "desktop"
    L = LAYOUT[kind]
    W, H = L["W"], L["H"]
    only = [x for x in a.only.split(",") if x]
    E = B / "edit"
    if E.exists():
        shutil.rmtree(E)
    E.mkdir(parents=True)
    bg = mask = None
    if kind == "mobile":
        bg, mask = E / "bg.png", E / "mask.png"
        mobile_background(L, bg)
        mobile_mask(L, mask)

    clips, events, labels, chapters, srt, cursor = [], [], [], [], [], []
    stage0 = (nar['meta'].get('stages') or ['main'])[0]
    vp_scale = 4 / 3  # desktop profile: 1440x810 CSS -> 1920x1080
    last_xy = {}
    t = 0.0
    for ch in nar["chapters"]:
        if only and ch["id"] not in only:
            continue
        card_segs = [s for s in ch["segments"] if s["onCard"]]
        rec_segs = [s for s in ch["segments"] if not s["onCard"]]
        chapters.append((t, ch["title"]))
        # 1) title card with its narration
        if ch.get("card"):
            img = E / f"{ch['id']}-card.png"
            render_card(ch["card"], W, H, img)
            placements, off = [], 0.6
            for s in card_segs:
                placements.append((B / "audio" / f"{s['id']}.wav", off))
                events += caption_events(s["cap"], t + off, durs[s["id"]]["secs"], L["card_cap_width"], "CapCard", L["max_lines"])
                srt.append((t + off, t + off + durs[s["id"]]["secs"], s["cap"]))
                off += durs[s["id"]]["secs"] + a.gap
            dur = max(3.0, off + 0.5)
            wav = E / f"{ch['id']}-card.wav"
            mix_audio(placements, dur, wav)
            out = E / f"{ch['id']}-card.mp4"
            card_clip(img, wav, dur, out)
            clips.append(out)
            t += dur
        # 2) the recording
        rd = B / "rec" / ch["id"]
        if rec_segs and (rd / "frames.json").exists():
            marks = json.loads((rd / "marks.json").read_text())
            fr = json.loads((rd / "frames.json").read_text())
            base = fr["frames"][0]["t"] - marks["t0"]  # ms from capture t0 to first frame
            seg_at = {m["id"]: (m["t"] - base) / 1000 for m in marks["marks"] if m["kind"] == "seg"}
            placements = []
            lab = [(m["t"] - base) / 1000 for m in marks["marks"] if m["kind"] == "label"]
            for s in rec_segs:
                if s["id"] not in seg_at:
                    continue
                off = seg_at[s["id"]]
                placements.append((B / "audio" / f"{s['id']}.wav", off))
                d = durs[s["id"]]["secs"]
                events += caption_events(s["cap"], t + off, d, L["cap_width"], "Cap", L["max_lines"])
                srt.append((t + off, t + off + d, s["cap"]))
            total = (fr["tEnd"] - fr["frames"][0]["t"]) / 1000
            wav = E / f"{ch['id']}-rec.wav"
            mix_audio(placements, total, wav)
            out = E / f"{ch['id']}-rec.mp4"
            rec_clip(rd, wav, L, kind, bg, mask, out)
            clips.append(out)
            if kind == "desktop":
                ms = sorted(marks["marks"], key=lambda m: m["t"])
                cam0 = next((m for m in ms if m["kind"] == "camera"), None)
                st0 = stage0 if cam0 is None or cam0["t"] > base + 50 else cam0["key"]
                cursor += cursor_events(ms, base, t, total, vp_scale, st0, last_xy.get(st0, (720, 405)))
                for m in ms:
                    if m["kind"] == "move":
                        last_xy[m.get("stage", stage0)] = (m["x1"], m["y1"])
            labels.append((t + 0.4, t + 4.2, ch["title"]))
            t += total
        elif rec_segs:
            print(f"!! {ch['id']}: no recording found in {rd}")

    # 3) concat (all intermediates share codec params)
    lst = E / "clips.txt"
    lst.write_text("".join(f"file '{c}'\n" for c in clips))
    joined = E / "joined.mkv"
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(joined)])

    # 4) captions
    ass = E / "captions.ass"
    write_ass(events, labels, L, ass, cursor)
    name = a.out or a.video
    O = ROOT / "out"
    O.mkdir(exist_ok=True)
    with (O / f"{name}.srt").open("w", encoding="utf-8") as f:
        for i, (s0, s1, text) in enumerate(srt, start=1):
            f.write(f"{i}\n{srt_time(s0)} --> {srt_time(s1)}\n" + "\n".join(textwrap.wrap(text, 42)) + "\n\n")
    with (O / f"{name}.chapters.txt").open("w", encoding="utf-8") as f:
        for s0, title in chapters:
            m, s = divmod(int(s0), 60)
            f.write(f"{m}:{s:02d} {title}\n")

    # 5) loudnorm pass 1 (measure)
    r = run(["ffmpeg", "-v", "info", "-y", "-i", str(joined), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"])
    meas = json.loads(r.stderr[r.stderr.rindex("{"):r.stderr.rindex("}") + 1])
    ln = (f"loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={meas['input_i']}:measured_TP={meas['input_tp']}:"
          f"measured_LRA={meas['input_lra']}:measured_thresh={meas['input_thresh']}:offset={meas['target_offset']}:linear=true")
    final = O / f"{name}.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(joined),
         "-vf", f"ass={ass}:fontsdir={FONT_DIR}",
         "-af", f"highpass=f=70,{ln},aresample=48000", "-ac", "2",
         "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", str(FPS),
         "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(final)])
    # 6) verification: measured loudness of the final file
    r = run(["ffmpeg", "-v", "info", "-i", str(final), "-af", "loudnorm=print_format=json", "-f", "null", "-"])
    m2 = json.loads(r.stderr[r.stderr.rindex("{"):r.stderr.rindex("}") + 1])
    dur = probe_dur(final)
    # contact sheet: one frame every ~dur/16 s
    sheet = O / f"{name}.review.jpg"
    n = 16
    tile = "4x4"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(final), "-vf",
         f"fps={n / max(dur, 1):.5f},scale={'270:480' if kind == 'mobile' else '480:270'},tile={tile}", "-frames:v", "1", str(sheet)])
    report = {"file": str(final), "duration_s": round(dur, 2), "chapters": [(round(s, 2), tt) for s, tt in chapters],
              "loudness_final": {k: m2[k] for k in ("input_i", "input_tp", "input_lra")}, "captions": len(events)}
    (O / f"{name}.edit-report.json").write_text(json.dumps(report, indent=1, ensure_ascii=False))
    print(json.dumps(report, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
