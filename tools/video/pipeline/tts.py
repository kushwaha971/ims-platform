"""Kokoro (kokoro-onnx) Hindi TTS for the YourKhata demo videos.

Why phonemize here instead of letting kokoro-onnx do it: kokoro-onnx calls
phonemizer with the default `language_switch="keep-flags"`, so any Latin word
inside Hindi text comes back as `(en)dʒˈiː ˈɛs tˈiː(hi)` and the literal
"(en)"/"(hi)" letters are fed to the model and spoken. We phonemize with
`remove-flags` and, as a rule, the narration's `say` text is fully Devanagari
(English UI words respelled in Devanagari, e.g. इनवॉइस, डैशबोर्ड, जी एस टी,
यौर खाता) so the Hindi voice never switches accent mid-sentence.
"""
from __future__ import annotations

import re
import sys
import threading
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
MODEL = ROOT / "models" / "kokoro-v1.0.onnx"
VOICES = ROOT / "models" / "voices-v1.0.bin"

DEFAULT_VOICE = "hm_omega"  # chosen in PHASE 1 (samples/battery*, samples/brand)
DEFAULT_SPEED = 0.95
SR = 24000

_lock = threading.Lock()
_kokoro = None

# Brand/UI words: always respelled so pronunciation is fixed, even if a Latin
# word slips into a `say` line.
RESPELL = {
    r"\bYourKhata\b": "यौर खाता",
    r"योर खाता|यॉरखाता|यॉर खाता": "यौर खाता",  # ASR round trip: only this spelling is heard as "your khata"
    r"\byourkhata\.com\b": "यौर खाता डॉट कॉम",
    r"\bGSTIN\b": "जी एस टी आई एन",
    r"\bGST\b": "जी एस टी",
    r"\bHSN\b": "एच एस एन",
    r"\bUPI\b": "यू पी आई",
    r"\bQR\b": "क्यू आर",
    r"\bPDF\b": "पी डी एफ",
    r"\bCSV\b": "सी एस वी",
    r"\bSMS\b": "एस एम एस",
    r"\bA4\b": "ए फ़ोर",
    r"\binvoices?\b": "इनवॉइस",
    r"\bdashboard\b": "डैशबोर्ड",
    r"\bWhatsApp\b": "व्हाट्सऐप",
}


def respell(text: str) -> str:
    for pat, rep in RESPELL.items():
        text = re.sub(pat, rep, text, flags=re.IGNORECASE)
    return text


def _k():
    global _kokoro
    if _kokoro is None:
        from kokoro_onnx import Kokoro

        _kokoro = Kokoro(str(MODEL), str(VOICES))
    return _kokoro


def phonemize(text: str, lang: str = "hi") -> str:
    from phonemizer import phonemize as ph

    k = _k()
    with _lock:
        p = ph(
            text,
            language=lang,
            backend="espeak",
            preserve_punctuation=True,
            with_stress=True,
            language_switch="remove-flags",
        )
    return "".join(c for c in p if c in k.tokenizer.vocab).strip()


def synth(text: str, out: Path, voice: str = DEFAULT_VOICE, speed: float = DEFAULT_SPEED,
          lang: str = "hi", raw: bool = False, tail_pad: float = 0.15) -> float:
    """Synthesise `text` to a mono 24 kHz WAV at `out`. Returns seconds."""
    k = _k()
    if lang.startswith("en"):
        samples, sr = k.create(text if raw else respell(text), voice=voice, speed=speed, lang=lang)
    else:
        ph = phonemize(text if raw else respell(text), lang)
        # Kokoro's context is ~510 phoneme tokens; split long lines on sentence ends.
        chunks, cur = [], ""
        for part in re.split(r"(?<=[।!?.])\s+", ph):
            if len(cur) + len(part) > 400 and cur:
                chunks.append(cur)
                cur = part
            else:
                cur = (cur + " " + part).strip()
        if cur:
            chunks.append(cur)
        pieces = []
        for c in chunks:
            s, sr = k.create(c, voice=voice, speed=speed, lang=lang, is_phonemes=True)
            pieces.append(s)
            pieces.append(np.zeros(int(0.25 * sr), dtype=np.float32))
        samples = np.concatenate(pieces[:-1])
    samples = np.concatenate([samples, np.zeros(int(tail_pad * sr), dtype=np.float32)])
    out.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(out), samples, sr)
    return len(samples) / sr


SPEED_BY_VIDEO = {"mobile": 1.05}  # lead-approved: mobile runs to 6–8 min


def build(video: str, voice: str = DEFAULT_VOICE, speed: float | None = None) -> None:
    """narration.json -> audio/<seg>.wav (48 kHz mono, silence trimmed, 80 ms pads) + durations.json."""
    import hashlib
    import json
    import subprocess

    speed = speed or SPEED_BY_VIDEO.get(video, DEFAULT_SPEED)
    B = ROOT / "build" / video
    nar = json.loads((B / "narration.json").read_text())
    (B / "audio" / "cache").mkdir(parents=True, exist_ok=True)
    durs, total = {}, 0.0
    for ch in nar["chapters"]:
        for s in ch["segments"]:
            say = respell(s["say"])
            key = hashlib.sha1(f"kokoro|{voice}|{speed}|{say}".encode()).hexdigest()[:16]
            raw = B / "audio" / "cache" / f"{key}.wav"
            if not raw.exists():
                synth(say, raw, voice=voice, speed=speed, raw=True, tail_pad=0.0)
            out = B / "audio" / f"{s['id']}.wav"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-af",
                            "silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
                            "silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
                            "adelay=80,apad=pad_dur=0.08,aresample=48000", "-ac", "1", "-c:a", "pcm_s16le", str(out)], check=True)
            d = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(out)],
                                     capture_output=True, text=True).stdout)
            durs[s["id"]] = {"secs": round(d, 3), "chapter": ch["id"], "onCard": s["onCard"]}
            total += d
            print(f"{s['id']:6} {d:5.2f}s  {s['cap'][:70]}", flush=True)
    (B / "durations.json").write_text(json.dumps(durs, indent=1))
    print(f"TOTAL narration {total:.1f}s = {total / 60:.1f} min over {len(durs)} segments ({voice}, speed {speed})")


if __name__ == "__main__":
    #   python3 tts.py build <video> [voice] [speed]
    #   python3 tts.py say "<text>" out.wav [voice] [speed]
    if sys.argv[1] == "build":
        build(sys.argv[2], *(sys.argv[3:4] or [DEFAULT_VOICE]), *([float(sys.argv[4])] if len(sys.argv) > 4 else []))
    else:
        txt, dst = sys.argv[2], Path(sys.argv[3])
        v = sys.argv[4] if len(sys.argv) > 4 else DEFAULT_VOICE
        sp = float(sys.argv[5]) if len(sys.argv) > 5 else DEFAULT_SPEED
        print(f"{synth(txt, dst, v, sp):.2f}s")
