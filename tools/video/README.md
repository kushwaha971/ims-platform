# Video tooling: demo films and landing-page loops

This folder holds the code that makes the three narrated demo films and the silent product loops on the landing page. It contains **code only**. Recordings, renders, TTS models and the finished films are never committed: `videos/` and `frontend/public/media/landing/demo-*` are git-ignored.

## What it produces

| Output | Where it lives | In git? |
|---|---|---|
| Narrated films: `mobile.mp4` (1080×1920), `desktop.mp4` (1920×1080), `superadmin.mp4` (PRIVATE, never public), each with `.srt`, `.chapters.txt`, `youtube.md` and a README | owner's Mac: `~/Projects/ims-platform/videos/` | **No** |
| Landing demo films: `demo-desktop-720.mp4`, `demo-mobile.mp4`, their `.vtt` and posters (used by the "Watch the demo" dialog) | `frontend/public/media/landing/demo-*` | **No** (ignored) |
| Landing loops: `hero-{desktop,mobile}` and `feat-<name>-{desktop,mobile}` as `.webm`, `.mp4` and `-poster.{webp,jpg}`, plus `manifest.json` | `frontend/public/media/landing/` | **Yes** (small, needed by the page) |

## Layout

- `pipeline/`: the recorder and editor.
  - `record.mjs` captures frames with Playwright/CDP against the live stack.
  - `seed.mjs` creates the demo business "Sharma General Store".
  - `tts.py` is Kokoro TTS: voice `hm_omega`, Devanagari input, with "YourKhata" written as यौर खाता.
  - `edit.py` is the ffmpeg edit: captions, tap/cursor overlay, loudnorm to −16 LUFS.
  - `review.py` checks caption-to-speech sync (target < 300 ms), loudness, black frames and privacy.
  - `make.sh <mobile|desktop|superadmin>` runs the whole chain.
  - `make_operator.sh` creates, and afterwards deactivates, the demo super-admin used for the private film.
  - `stories/` holds one story per film.
- `scripts/`: the Hinglish scripts (`mobile.md`, `desktop.md`, `superadmin.md`) and the YouTube text (`youtube.md`).
- `rec/`: exploration helpers.
- `landing-loops/`: cuts landing loops from the raw recordings.
  - `specs.json` lists the segments for each loop.
  - `render.py specs.json [names]` builds the lossless masters.
  - `encode.sh` encodes VP9 WebM plus H.264 MP4 within the byte caps.
  - `posters.sh` writes the posters, which must equal each loop's first frame.
  - `manifest.py` writes `manifest.json`. Keep its schema and asset ids: the landing code and `landingMedia.test.ts` depend on them.

## Setup

1. **Paths.** The scripts assume a workspace at `/home/claude/video` with the repo at `/home/claude/repo`, which is how the original cloud session ran. Either recreate those two paths (symlinks are fine) or change the `ROOT`/`REPO` constants at the top of `pipeline/lib.mjs`, `pipeline/tts.py`, `pipeline/edit.py`, `pipeline/make.sh` and the `landing-loops/*` scripts.
2. **Dependencies.** These are tooling, not app dependencies, so ADR-021 isn't affected. Install them in the tooling folder only:
   - `ffmpeg`
   - Python 3 with `pip install kokoro-onnx==0.6.1 phonemizer espeakng-loader sherpa-onnx`
   - `apt install espeak-ng`, plus Noto fonts for the captions
   - Node with `npm ci` inside `pipeline/` (Playwright; point it at an existing Chromium, don't download one)
3. **Models.** Put these in `<workspace>/models/`:
   - `kokoro-v1.0.onnx` and `voices-v1.0.bin`, from the kokoro-onnx v1.0 model release;
   - `sherpa/sherpa-onnx-whisper-small`, from the sherpa-onnx ASR model releases, used by `review.py` to check narration.

   Check the exact release pages before downloading.
4. **Stack.** A live stack must be running (see `RUNNING.md`): `./e2e/serve-api.sh` (relaxed throttles) and `./e2e/serve.sh`.

## Hard rules

- **Only real UI.** Every frame comes from the real app. Never mock up a screen, and never show a module that isn't built.
- **Privacy:**
  - demo data only;
  - emails blurred, which the recorder enforces and fails the take otherwise;
  - passwords typed into masked fields, never shown;
  - no tokens, share-link tokens or temp passwords on screen.
- **Public films** contain no super-admin screens. `superadmin.mp4` is private.
- **Customer documents** in the films (invoice, receipt, share page) show only the shop's name, never YourKhata or the domain.
- **No jargon** such as "kirana". The demo business is "Sharma General Store".
- **Loop byte caps:**

  | Loop | WebM | MP4 |
  |---|---|---|
  | hero-desktop | ≤ 1.2 MB | ≤ 1.8 MB |
  | hero-mobile | ≤ 0.9 MB | ≤ 1.4 MB |
  | feat loops | ≤ 700 KB | ≤ 1 MB |

  Loops are 30 fps with no audio, seamless, with each poster equal to the first frame. The demo films should be ≤ 18 MB (desktop 720p) and ≤ 12 MB (mobile).
