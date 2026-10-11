# Landing page, SEO and demo videos — report (11 Oct 2026)

Commits on `dev` (not pushed, not deployed): `77803440` (Library and Lending
released) and `e88a067a` (landing page, recordings, demo films).

## 1. What changed on the landing page

- **Three modules, each with real screens.** Shop & billing, Lending &
  collections and Library each have a card with a recording of their actual
  screens, a short description, four "What you can do" lines and two actions
  (Start free, See it in the demo). On a phone the card shows a recording of
  the phone layout in a phone frame; from tablet width up, the desktop layout
  in a browser frame.
- **Gym and Hotel are hidden** (see section 3).
- **New demo section** (`#demo`): the narrated product demo in English or
  Hindi, with a language switch, chapters, captions and a full transcript.
- **Order of the page:** hero → modules → demo → the six shop jobs → module
  map → why → who it's for → also included → how it works → FAQ → closing.
- **Phone layout:** the six shop jobs are one tabbed explorer at every width
  (they used to be stacked: 7,000 px on a phone). Module cards no longer
  repeat the "Built on" chips on a phone. Page height on a 360 px phone went
  from 22,389 px to about 17,100 px, with the demo section added.
- **Copy corrected:** the page said "sign up with email" in four places; it
  now says mobile number and a 4-digit code everywhere. Hero badge and body
  name the three modules. Four new FAQ answers: what YourKhata is, how to sign
  up, what a library can do with it, and running several businesses.

## 2. Files and components changed

Frontend (`frontend/`):

- `app/page.tsx` — metadata and structured data follow the visible modules; VideoObject for the films
- `src/constants.ts` — `LANDING_HIDDEN_MODULES`, `DEMO_VIDEO_BASE_URL`
- `src/modules/DigiKhaato/features/landing/components/`
  - new: `DemoSection.tsx`
  - changed: `LandingPage.tsx`, `LandingHero.tsx`, `LandingHeader.tsx`, `ModulesSection.tsx`, `LandingModuleParts.tsx`, `UseCaseExplorer.tsx`, `PlatformMap.tsx`, `LandingClosing.tsx`
  - removed: `DemoVideoDialog.tsx`
- `src/modules/DigiKhaato/features/landing/config/` — `modules.ts`, `media.ts`, `seo.ts`, `faq.ts`, new generated `demoTranscript.ts`
- `src/modules/DigiKhaato/features/landing/utils/landingJsonLd.ts`
- `src/design-system/UbPicture/` — new (poster image in WebP + JPEG)
- `src/utils/accountIdentity.ts` — new; used by `components/layout/AccountMenu.tsx`, `navigation/components/MorePageContent.tsx`, `team/components/MemberColumns.tsx`, `team/components/MembersSection.tsx`
- `locales/catalogues/landing.{en,hi}.json` — copy, alt text, demo and FAQ words
- `public/media/landing/` — every video, poster and the manifest replaced
- `bundle-budgets.json`
- Tests: `LandingPage.test.tsx`, `LandingPage.pricingFlag.test.tsx`, `config/modules.test.ts`, `config/landingMedia.test.ts`, `src/tests/seo.test.tsx`, `src/tests/moduleVocabulary.ts`, `src/utils/accountIdentity.test.ts`

Backend (`backend/`), in `77803440`:

- `apps/platform_app/constants.py`, `apps/platform_app/management/commands/seed_plans.py`
- `apps/lending/migrations/0004_release.py`, `apps/library/migrations/0010_release.py`
- Tests: `apps/platform_app/tests/test_release_gate.py`, `apps/library/tests/test_codenames.py`, `test_settings.py`, `test_skeleton.py`

Recording tooling: `e2e/demo/` (new; see `e2e/demo/README.md`).
Documents: `docs/demo/`, `docs/DECISIONS.md` (DEC-015), `docs/platform/00-platform-vision.md`.

## 3. Hiding Gym and Hotel, and how to bring them back

One value: `NEXT_PUBLIC_LANDING_HIDDEN_MODULES`, default `gym,hotel`
(`frontend/src/constants.ts`). It is read at build time.

It hides them from the landing page only: the module cards, the module map,
"Who it's for", the "Which modules are there?" answer, the page title and
description, and the structured data. Their copy, icons and config rows are
untouched, and no code, table, API, route or permission was removed. In the
backend, `gym` and `hospitality` were already behind the release gate and
still are.

To show them again: build with `NEXT_PUBLIC_LANDING_HIDDEN_MODULES=` (empty).
To hide a different set: a comma-separated list of `shop`, `lending`,
`library`, `gym`, `hotel`.

## 4. SEO, AI-search, accessibility and performance work

**Search**

- Title: "YourKhata: shop billing, library and lending in one app" (55
  characters). Description names what each of the three modules keeps (154
  characters). Both switch to the five-module wording when nothing is hidden.
- Canonical URL, robots rules, sitemap, Open Graph and Twitter card were
  already in place and were kept. Checked: one `h1`, section headings in
  order, no skipped levels.
- Structured data, one graph: Organization, WebSite, SoftwareApplication (now
  with the three module names as `featureList`), FAQPage (14 questions, the
  same text the page renders), and one VideoObject per language with name,
  description, thumbnail, upload date with timezone, duration, content URL and
  transcript.
- All six shop jobs, all 14 FAQ answers and both video transcripts are in the
  server's HTML, whether or not their tab or disclosure is open.

**AI-search (GEO)**

- Plain answers to the questions a cold visitor or an answer engine asks:
  what it is, who it is for, how sign-up works, what each module does, how
  Lending differs (it records loans; it does not lend or move money).
- No location claims, reviews, ratings, user counts or competitor names; the
  existing tests that forbid them still pass.

**Checked against Google's current documentation** (Search Central, pages
last updated Sept–Oct 2026):

- Video structured data requires `name`, `thumbnailUrl` and `uploadDate`; all
  are present.
- Google only shows video results for a **watch page**, where the video is the
  main content. The landing page is not one, so the markup is valid but the
  films may not appear as video results. A dedicated `/demo` page would fix
  that (see section 9).
- FAQ rich results are shown only for well-known government and health sites.
  The FAQ markup is harmless and helps answer engines, but will not produce a
  rich result.

**Accessibility**

- Lighthouse accessibility is 100 before and after.
- Video: never autoplays, captions on by default, real controls, a transcript,
  and a fallback message with a sign-up link if a file is missing.
- Each module's two links have their own accessible names ("Start free with
  Library"). Language tabs are a keyboard-operable tablist. Reduced-motion
  handling from the existing components is unchanged.

**Performance**

- Before play is pressed the demo section costs one poster image. No film,
  caption file or player is loaded.
- A phone only downloads phone recordings and a desktop only desktop ones.
- The demo section is its own script chunk, outside the page's first load.
- Every video box has a fixed aspect ratio, so nothing shifts (CLS 0).

## 5. Performance measurements

Lighthouse 12 on a production build served locally (`next build`, standalone
server). Phone figures are the default profile (slow 4G, 4× CPU slowdown).

| | Before | After |
| --- | --- | --- |
| Phone: performance | 78 | 80 |
| Phone: LCP, simulated throttling | 5.3 s | 5.1 s |
| Phone: LCP, applied throttling (one run each) | 2.1 s | 2.5 s |
| Phone: CLS | 0 | 0 |
| Phone: total blocking time | 10 ms | 0 ms |
| Phone: speed index | 3.4 s | 2.0 s |
| Phone: page weight | 1,466 KB | 1,508 KB |
| Desktop: performance | 98 | 99 |
| Desktop: LCP | 1.1 s | 1.0 s |
| Accessibility (both) | 100 | 100 |
| SEO (both) | 100 | 100 |
| Best practices (both) | 96 | 96 |

Read against the targets:

- **CLS ≤ 0.1:** met (0).
- **INP ≤ 200 ms:** cannot be measured in a lab; total blocking time, its lab
  stand-in, is 0 ms.
- **LCP ≤ 2.5 s:** met on desktop. On a phone it depends on the method: 2.1–2.5
  s when the throttling is actually applied, 5.1 s under Lighthouse's
  simulation. **This did not materially improve.** The LCP element is the hero
  paragraph, which is in the first HTML; the simulated delay comes from the
  236 KB of JavaScript every route loads and three render-blocking
  stylesheets, which this work did not change.
- These are lab numbers from one machine. PageSpeed Insights and real-user
  data need the deployed site.

## 6. The demo videos

Four films, same journey and same words in each language:

| File | Layout | Length | Size |
| --- | --- | --- | --- |
| `demo-en-desktop.mp4` | desktop, 1280×720 | 3:11 | 7.4 MB |
| `demo-en-mobile.mp4` | phone, 720×1558 | 3:10 | 7.6 MB |
| `demo-hi-desktop.mp4` | desktop, 1280×720 | 3:39 | 8.5 MB |
| `demo-hi-mobile.mp4` | phone, 720×1558 | 3:38 | 8.8 MB |

Status: **complete and on the page**, with the limits below.

Coverage, in order: title card → sign-up with a new mobile number and code,
then business setup → logging back in and the dashboard → Shop: a customer's
account and a "You got" entry, a GST bill issued, items and reports → Library:
home, students and a new admission, catalogue search, a book issued and
returned at the counter, seats and attendance → Lending: today's collection
list, a collection saved, loans, one loan's schedule, the new-loan form → one
login for three businesses, adding staff, switching to Hindi → closing card.

Every action is performed on the real product (a separate demo copy with
sample data) by a script; nothing is mocked or edited in.

**Limits, stated plainly**

- **The voice is computer-generated.** English is Samantha (an American
  voice; no Indian-English female voice is installed on this Mac). Hindi is
  Lekha (an Indian voice). The page says so under the transcript. Swapping in
  better voices or a recorded narrator is described in `e2e/demo/README.md`.
- **The screens in the Hindi films are in English.** The narration, captions,
  title cards and transcript are Hindi; the app was recorded in English for
  both, and the last scene shows it switching to Hindi.
- **Captions are a separate track**, on by default, not burned into the
  picture.
- **No zoom-ins.** A visible pointer shows where each tap happens.
- **Not shown, because the product does not have it:** a cart, checkout or
  online payment (Shop is billing for a shop's own counter, not an online
  store), and role selection at sign-up (roles are given when staff are
  added, which is shown).
- **Product gap found while recording:** the Library counter says "type a
  name", but a student is found only by student number. The film uses the
  number.

The 18 silent loops (hero, six shop jobs, Library and Lending, each for phone
and desktop) were re-recorded the same way and replace every earlier clip.

## 7. Where everything is

| What | Where |
| --- | --- |
| Films, captions (`.vtt`), posters | `frontend/public/media/landing/demo-{en,hi}-{desktop,mobile}.*` |
| Silent loops and posters | `frontend/public/media/landing/{hero,feat-*,mod-*}-{desktop,mobile}.*` |
| List of every media file | `frontend/public/media/landing/manifest.json` |
| Narration script (source of truth) | `e2e/demo/script.json` |
| Storyboards with recorded actions and timecodes | `docs/demo/storyboard-{en,hi}-{desktop,mobile}.md` |
| Transcripts | `docs/demo/demo-{en,hi}-transcript.md` |
| How to re-record | `e2e/demo/README.md` |

## 8. Tests and build

- Frontend: type-check and lint clean; locale check passes (5,841 keys); the
  last full run was 3,611 of 3,612 passing, and the one failure (a test that
  now finds two recordings on the Shop card) was fixed and its suite re-run:
  70 of 70. The full suite was not re-run after that one-line test change.
- Production build passes; every size budget passes after seven ceilings were
  raised by 1 KB (recorded in `bundle-budgets.json`).
- Backend: the suites for the platform, Library, Lending, common code and the
  architecture checks pass with the release in place.
- Regression check of the three modules: the recordings themselves sign in
  and work through Shop, Library and Lending on the built app on both screen
  sizes; all takes finished with no missed step. The older browser regression
  suite (`e2e/run-regression.mjs`) was **not** re-run for this change.
- Checked in a browser on phone and desktop sizes: no horizontal overflow, the
  demo plays the right cut with captions, the language switch works, nothing
  is fetched for the films before play.

## 9. Deployment checklist and what is left

Before deploying:

1. Push `dev` and deploy as usual. Nothing was deployed by this work.
2. On the production database run `python manage.py migrate`. This adds
   Library and Lending to every plan (`lending/0004_release`,
   `library/0010_release`); both can be reversed.
3. Keep `UB_UNRELEASED_MODULES` unset in production. Library and Lending no
   longer need it; Gym and Hotel stay hidden without it.
4. Leave `NEXT_PUBLIC_LANDING_HIDDEN_MODULES` unset (it defaults to
   `gym,hotel`).
5. Set `NEXT_PUBLIC_SITE_URL` to the real public address, so canonical links,
   the sitemap and the video URLs are right.
6. The films add about 32 MB to the repository and the image. To serve them
   from a CDN instead, upload the `demo-*` files and set
   `NEXT_PUBLIC_DEMO_VIDEO_BASE_URL` to that folder.
7. After deploying: sign up with a new number, create a library business and
   confirm the Library menu appears. This path was tested locally, not on
   production.
8. Run PageSpeed Insights on the live URL, and Google's Rich Results Test for
   the structured data.

Still open:

- **Voice quality**, as above.
- **A `/demo` watch page**, if you want the films eligible for Google's video
  results.
- **Phone LCP under simulated throttling** needs work on the shared JavaScript
  bundle, which affects every page, not only this one.
- **Hindi-language screens in the Hindi films**, if wanted: the recorder
  would need Hindi button names.
- Sign-in currently depends on the SMS provider being set up; without it,
  nobody can sign up on production.
