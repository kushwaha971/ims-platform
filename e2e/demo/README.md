# The demo recordings

Every moving picture on the landing page is recorded from the real product by
the scripts in this folder: the silent loops (hero, the six Shop & billing
jobs, the Library and Lending cards) and the four narrated demo films (English
and Hindi, each for the desktop layout and the phone layout).

Nothing is mocked. The scripts sign in the way a merchant does, on a **demo
stack** of its own, and what they record is what the product computed.

## The demo stack

A separate database and a separate API, so nothing here touches your
development data and no SMS is ever sent:

| | |
| --- | --- |
| Database | `yourkhata_demo` on the local PostgreSQL |
| API | `manage.py runserver 127.0.0.1:8100`, `UB_OTP_PROVIDER=console` (codes are printed in its log) |
| Frontend | a production build with `NEXT_PUBLIC_API_BASE_URL=http://localhost:8100/api/v1`, served on `:3100` |

`localhost`, not `127.0.0.1`, in the frontend address: the session cookie is
set for the host the API was called on.

## The files

| File | What it does |
| --- | --- |
| `seed-demo.mjs` | Builds the demo book through the public API: one owner (mobile + OTP), and three businesses — Sharma General Store (Shop), Vidya Reading Room (Library), Verma Finance (Lending). |
| `flows.mjs` | What the recordings do, written once for both screen sizes. |
| `record-clips.mjs` | Records the 18 silent loops (9 × desktop and phone). |
| `encode-clips.mjs` | Trims, encodes (VP9 + H.264), makes posters and `manifest.json`. `--publish` copies them into `frontend/public/media/landing/`. |
| `script.json` | The narration, scene by scene, in English and Hindi. **The source of truth** for the voice, the captions, the transcript and the storyboard. |
| `voice.mjs` | One audio file per caption line, and how long each runs. |
| `record-demo.mjs` | Records the picture of one film, holding each scene for as long as its narration runs. |
| `build-demo.mjs` | Cuts and joins the scenes, lays the voice over, writes captions, posters, transcripts and storyboards. `--publish` copies them into the page and `docs/demo/`. |
| `lib.mjs` | Shared: sign-in, the visible pointer, posters. |

## Re-recording

Each take changes the demo book (a bill, an entry, a collection), so each
starts from a fresh database.

```bash
# 0. once per session
export E2E_BACKEND=http://127.0.0.1:8100/api/v1
export DEMO_API_LOG=<the demo API's log file>
export DEMO_FRONTEND=http://localhost:3100

# 1. fresh demo database, migrate, seed_all, start the API on :8100, then:
node e2e/demo/seed-demo.mjs

# 2. the silent loops
node e2e/demo/record-clips.mjs <work>/clips            # both sizes
node e2e/demo/encode-clips.mjs <work>/clips --publish

# 3. the narrated films (re-seed before EACH take)
node e2e/demo/voice.mjs <work>/film
DEMO_LANG=en DEMO_DEVICE=desktop node e2e/demo/record-demo.mjs <work>/film
DEMO_LANG=en DEMO_DEVICE=mobile  node e2e/demo/record-demo.mjs <work>/film
DEMO_LANG=hi DEMO_DEVICE=desktop node e2e/demo/record-demo.mjs <work>/film
DEMO_LANG=hi DEMO_DEVICE=mobile  node e2e/demo/record-demo.mjs <work>/film
node e2e/demo/build-demo.mjs <work>/film --publish
```

A step that cannot be performed is logged as `MISSED` and the recorder exits
non-zero; `encode-clips.mjs` and `build-demo.mjs` refuse a take with a missed
step, so a film with a hole in it is never built silently.

## Changing the voice

The voice-over is `voice.mjs`, which uses the macOS `say` voices (Samantha for
English, Lekha for Hindi). They are computer voices and sound like it.

To use a recorded narrator or another service, put one audio file per caption
line at `<work>/voice/<lang>/<scene>-<n>.wav` (the names `voice.mjs` writes),
update the durations in `<work>/timing.json`, re-record the pictures (scene
lengths follow the narration) and run `build-demo.mjs`. The captions and the
transcript are timed from those files, so they stay in step.

## Changing what is said

Edit `script.json`, then run steps 3 onwards. Every sentence must describe
something `record-demo.mjs` actually does in that scene.

## Two things that cost time

- **The phone layout must be recorded with `--force-device-scale-factor=2`**
  (`PHONE.launch` in `flows.mjs`). Playwright's video is in CSS pixels whatever
  `deviceScaleFactor` the context asks for: with that option alone, the 390 px
  screen was drawn in the top-left corner of a 780 px frame.
- **A collection is always dated today.** A seeded collection that covers what
  has fallen due leaves Lending's Today list with no "Collect" to press, so
  the seed collects less than is due.
