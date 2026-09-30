"""review.py <name> — automated checks on a finished video in out/.

1. A/V sync: speech onsets in the FINAL audio (silencedetect) vs every caption
   start in the SRT (the editor derives both from the same recorder marks, so
   a drift here means the mix or the concat moved something).
2. Whisper-small round trip (hi -> en translate) on one narrated segment per
   chapter, cut from the final MP4, printed next to the caption for judgement.
3. Contact sheets: a frame 3 s into every chapter, plus 24 evenly spaced frames.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
name = sys.argv[1]
O = ROOT / "out"
mp4 = O / f"{name}.mp4"


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def t2s(t):
    h, m, rest = t.split(":")
    s, ms = rest.split(",")
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000


srt = (O / f"{name}.srt").read_text(encoding="utf-8").strip().split("\n\n")
caps = []
for block in srt:
    lines = block.split("\n")
    a, b = lines[1].split(" --> ")
    caps.append((t2s(a), t2s(b), " ".join(lines[2:])))

# 1) sync
r = run(["ffmpeg", "-i", str(mp4), "-af", "silencedetect=noise=-38dB:d=0.25", "-f", "null", "-"])
ends = [float(x) for x in re.findall(r"silence_end: ([0-9.]+)", r.stderr)]
deltas = []
for a, b, text in caps:
    near = min(ends, key=lambda e: abs(e - a)) if ends else a
    deltas.append(near - a)
d = np.array(deltas)
ok = np.mean(np.abs(d) < 0.25)
report = {"captions": len(caps), "onset_vs_caption_median_s": round(float(np.median(d)), 3),
          "abs_p95_s": round(float(np.percentile(np.abs(d), 95)), 3), "within_250ms": round(float(ok), 3)}

# 2) whisper round trip, one segment per chapter
chap = [(int(l.split()[0].split(":")[0]) * 60 + int(l.split()[0].split(":")[1]), l.split(" ", 1)[1])
        for l in (O / f"{name}.chapters.txt").read_text().strip().split("\n")]
import sherpa_onnx  # noqa: E402

D = ROOT / "tts" / "sherpa-onnx-whisper-small"
rec = sherpa_onnx.OfflineRecognizer.from_whisper(encoder=f"{D}/small-encoder.int8.onnx", decoder=f"{D}/small-decoder.int8.onnx",
                                                 tokens=f"{D}/small-tokens.txt", language="hi", task="translate", num_threads=2)
asr = []
for i, (cs, title) in enumerate(chap):
    nxt = chap[i + 1][0] if i + 1 < len(chap) else 1e9
    inside = [c for c in caps if cs <= c[0] < nxt]
    if not inside:
        continue
    a, b, text = inside[min(1, len(inside) - 1)]
    pcm = run_b = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{a:.2f}", "-t", f"{b - a + 0.3:.2f}", "-i", str(mp4),
                                  "-ar", "16000", "-ac", "1", "-f", "f32le", "-"], capture_output=True).stdout
    s = rec.create_stream()
    s.accept_waveform(16000, np.frombuffer(pcm, dtype=np.float32))
    rec.decode_stream(s)
    asr.append({"chapter": title, "at": round(a, 1), "caption": text, "whisper_en": s.result.text.strip()})
report["asr"] = asr

# 3) contact sheets
kind_portrait = "1080x1920" in run(["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height",
                                    "-of", "csv=s=x:p=0", str(mp4)]).stdout
tw, th = (270, 480) if kind_portrait else (480, 270)
sel = "+".join(f"between(t\\,{cs + 3:.1f}\\,{cs + 3.04:.2f})" for cs, _ in chap)
n = len(chap)
cols = 6 if kind_portrait else 4
rows = (n + cols - 1) // cols
run(["ffmpeg", "-v", "error", "-y", "-i", str(mp4), "-vf", f"select='{sel}',scale={tw}:{th},tile={cols}x{rows}",
     "-frames:v", "1", "-vsync", "vfr", str(O / f"{name}.chapters-sheet.jpg")])
dur = float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(mp4)]).stdout)
run(["ffmpeg", "-v", "error", "-y", "-i", str(mp4), "-vf", f"fps={24 / dur:.5f},scale={tw}:{th},tile={8 if kind_portrait else 6}x{3 if kind_portrait else 4}",
     "-frames:v", "1", str(O / f"{name}.contact-sheet.jpg")])
(O / f"{name}.review.json").write_text(json.dumps(report, indent=1, ensure_ascii=False))
print(json.dumps({k: v for k, v in report.items() if k != "asr"}, indent=1))
for x in asr:
    print(f"[{x['at']:7.1f}] {x['chapter']}\n   cap: {x['caption']}\n   asr: {x['whisper_en']}")
