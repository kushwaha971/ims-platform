# The demo recordings

Every moving picture on the landing page is recorded from the real product by
the scripts in this folder: the silent loops (hero, the six Shop & billing
jobs, the Library and Lending cards) and the narrated demo film — one
narration, in Hindi with English subtitles, cut for the desktop layout and for
the phone layout.

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
| `seed-demo.mjs` | Builds the demo book through the public API: one owner (mobile + OTP), and three businesses, each choosing its app at sign-up the way a merchant does — Sharma General Store (Shop), Vidya Reading Room (Library only), Verma Finance (Lending only). |
| `flows.mjs` | What the recordings do, written once for both screen sizes. |
| `record-clips.mjs` | Records the 18 silent loops (9 × desktop and phone). |
| `encode-clips.mjs` | Trims, encodes (VP9 + H.264), makes posters and `manifest.json`. `--publish` copies them into `frontend/public/media/landing/`. |
| `script.json` | The narration, scene by scene: Hindi (spoken) and its English translation (subtitles). **The source of truth** for the voice, the captions, the transcript and the storyboard. |
| `voice.mjs` | One audio file per caption line, and how long each runs. |
| `record-demo.mjs` | Records the picture of one cut as timestamped frames, and stamps the moment each line is spoken. |
| `build-demo.mjs` | Builds each scene's picture from its frames, lays each line's voice where it was spoken, writes captions, subtitles, posters, transcripts and storyboards. `--publish` copies them into the page and `docs/demo/`. |
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

# 3. the narrated film (re-seed before EACH take)
node e2e/demo/voice.mjs <work>/film
DEMO_DEVICE=desktop node e2e/demo/record-demo.mjs <work>/film
DEMO_DEVICE=mobile  node e2e/demo/record-demo.mjs <work>/film
node e2e/demo/build-demo.mjs <work>/film --publish
```

A step that cannot be performed is logged as `MISSED` and the recorder exits
non-zero; `encode-clips.mjs` and `build-demo.mjs` refuse a take with a missed
step, so a film with a hole in it is never built silently.

## How the film is told

Every feature in the same order: a still card with the **problem** and a real
moment it bites, then the **answer performed step by step** on the real
screens, and its **benefit** in the last line. The problems are a business
owner's (who owes me, is the bill right, what is running out, who has paid this
month, whom do I collect from today), not a module tour.

## How the voice and the picture keep step

In `record-demo.mjs`, `cue(n)` means "line n is spoken from now". It waits for
the line before it to finish, stamps the moment, and the steps written after it
are performed while that line is heard. A line cannot start before the step
before it is done, and a step cannot run ahead of its line. `build-demo.mjs`
lays each line's audio and caption at the stamped time.

The picture is **not** Playwright's `recordVideo`. That recorder writes every
frame the browser sends at least once into a 25 fps file, and a moving pointer
sends more than 25 a second, so the file runs 4 to 9 per cent long against the
clock: on the first films the picture was 12 to 14 seconds behind the voice by
the end of a take. The recorder now keeps the browser's screencast frames with
their own timestamps, and the build shows each frame for exactly as long as it
was on screen.

To check a cut, take one frame per caption at 80% of the caption's length and
read them against the words; that is how every line of both cuts was checked.

## Changing the voice

The voice-over is `voice.mjs`, which uses a macOS `say` voice (Lekha, Hindi) at
138 words a minute, with a breath between sentences and 0.8 s between lines.
It is a computer voice and sounds like one.

To use a recorded narrator or another service, put one audio file per caption
line at `<work>/voice/hi/<scene>-<n>.wav` (the names `voice.mjs` writes), update
the durations in `<work>/timing.json`, re-record the pictures (each step waits
for its line) and run `build-demo.mjs`.

## Changing what is said

Edit `script.json`, then run step 3. Every sentence must describe something
`record-demo.mjs` actually does at that cue, and the `en` line must stay the
translation of the `hi` line beside it.

## Two things that cost time

- **The phone layout must be recorded with `--force-device-scale-factor=2`**
  (`PHONE.launch` in `flows.mjs`). Playwright's video is in CSS pixels whatever
  `deviceScaleFactor` the context asks for: with that option alone, the 390 px
  screen was drawn in the top-left corner of a 780 px frame.
- **A still card must wait for the app to be still.** `page.setContent` right
  after a sign-in is replaced a moment later by the app's own redirect, and the
  "card" in the film is a loading skeleton.
- **A collection is always dated today.** A seeded collection that covers what
  has fallen due leaves Lending's Today list with no "Collect" to press, so
  the seed collects less than is due.
