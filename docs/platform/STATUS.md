# Platform expansion: status

Owner direction of 29 Sep 2026: [00-platform-vision.md](00-platform-vision.md). The phases run strictly in order.

| # | Phase | Status | Output |
|---|---|---|---|
| 1 | Analyse the application; update the landing page to the platform vision | **DONE 29 Sep**; synced to the owner's Mac | `01-current-capabilities.md`; landing page (`features/landing`); `config/modules.ts` |
| 2 | Research the modules: lending, library, gym, hospitality, candidates | **Done 29 Sep**. Coaching & tuition was researched, then declined by the owner (not in scope) | `research/*.md` |
| 3 | Module documentation (FRDs) | **In progress.** Step 1, the cross-module architecture decisions, done 29 Sep; the FRDs are next | `10-architecture.md`, `11-contracts.md`, ADR-041–055; then `frd/*.md` |
| 4 | Architecture review and reuse map | Decisions and reuse map written in Phase 3 step 1 (so the FRDs can cite them); the review of the finished FRDs is still to do | `10-architecture.md` §12, ADRs |
| 5 | Implementation | Not started | |
| 6 | QA, fixes, integration | Not started | |
| 7 | Final sync and handoff | Not started | |

## Log

- **29 Sep:** Vision and rules accepted (CR-2026-09-29-PLATFORM-A). Existing module mechanism confirmed for reuse: `ModuleCode`, `tenant.enabled_modules`, `MODULE_DEPENDENCIES`, `_ModuleEnabled`.
- **29 Sep, Phase 1 (CR-2026-09-29-PLATFORM-B):**
  - `01-current-capabilities.md` inventories what is live, from the code. It is now the source of truth for landing-page claims. It found one false claim (statement share links), which is now corrected.
  - The landing page is repositioned to "one platform, many modules, shared core": hero → module map (#platform) → module cards (#modules) → Shop & billing explorer (#features) → Who it's for → also included → how it works → pricing → FAQ.
  - Every module's status comes from `features/landing/config/modules.ts`, and a test holds it to §2 of the vision doc. Shop & billing is live; Lending & collections, Library, Gym & fitness and Hotel & stays are planned. Planned modules have text only: no media, demo, dates or CTA, and their words appear only inside planned scopes (tested).
  - "kirana" and English "udhaar"/"khata" are gone from the landing copy and metadata (tested).
  - Pricing is unchanged; a line says module pricing is decided at launch.
  - Open for the owner: the recordings still show the demo business "Sharma Kirana Store"; the copy needs review; the `/` bundle budget was re-baselined.
- **29 Sep, Phase 1, SEO (CR-2026-09-29-PLATFORM-C):** see the section below.

## SEO (Phase 1, CR-2026-09-29-PLATFORM-C)

What search engines and link previews are told, and how it is checked. Detail and reasoning:
`docs/CR-LOG.md`, CR-2026-09-29-PLATFORM-C.

| Area | What is there | Checked by |
|---|---|---|
| Metadata for `/` | Title 59 chars, description 147, reaching all six modules (CR-2026-09-29-PLATFORM-D), no status word, no jargon. Absolute canonical `https://yourkhata.com/` from `SITE_URL` (`NEXT_PUBLIC_SITE_URL`); `metadataBase`; Open Graph; Twitter `summary_large_image`; `robots: index, follow, max-image-preview:large` | `src/tests/seo.test.tsx`, `e2e/seo.mjs` |
| Preview card | `public/brand/yourkhata-og.png`, 1200 × 630, K-c lockup + hero headline on indigo, rendered by `scripts/render-brand.mjs --og`. Static on purpose: a root `opengraph-image.tsx` would be inherited by `/d/<token>`, and `next/og` cannot read WOFF2 | both |
| Crawl rules | `robots.txt` allows `/`, `/legal/`, `/login`, `/signup`; disallows every guarded app prefix, admin, `/api/`, `/d/`, onboarding, accept-invite, the password flows, `/design-system`. `sitemap.xml` lists the five public pages | both |
| noindex | Meta on `(app)`, `(admin)`, onboarding, accept-invite, forgot/reset/set-password; `/d/<token>` meta + `X-Robots-Tag` (existing) | both |
| Structured data | One JSON-LD graph: Organization, WebSite, SoftwareApplication (**no offers** while pricing is hidden; the free plan only once shown but proposed), FAQPage from the rendered FAQ strings. No ratings or reviews | both |
| On-page | One h1, no skipped heading level (the desktop explorer's h4s fixed), header/nav/main/footer, labelled media, descriptive links; **every FAQ answer now in the server HTML** (it was absent) | both |
| Cache | `/media/landing/*` and `/brand/*`: `public, max-age=86400, stale-while-revalidate=604800` in Next and nginx; nginx now actually serves `/media/landing/` (it 404'd behind Django's internal `/media/`) | both |

**i18n and SEO, the trade-off.** The language is a cookie, so every page has one URL and crawlers
index the English page. No `hreflang` (there is no second URL) and no `/hi` route. Per-locale
URLs + hreflang is in `docs/BACKLOG.md`, with the finding that Hindi is not server-rendered
(`lang="hi"` over English HTML until the Hindi chunk lands).

**Cache choice.** Not `immutable`: the media names are unhashed and re-cut in place, so a year's
immutable cache would pin old cuts. A day fresh plus a week of stale-while-revalidate means a
repeat visit never waits and a re-cut reaches everyone within a day. Versioned URLs from the
manifest, which would earn `immutable`, are in the backlog.

**Lighthouse** (13.5, installed into a scratch directory through the proxy; not a project
dependency): SEO **92 → 100**, accessibility 100, best practices 96. The failing audit before was
the relative canonical. Performance is not a real figure on a machine at load average 13, but LCP
and CLS were compared before and after with Playwright and are unchanged within noise (CLS
0.000–0.005). `e2e/seo.mjs` runs the same SEO checklist on every run without Lighthouse: 96/96
against the live stack.

- **29 Sep, Phase 1 closed.** Videos and landing loops re-recorded on "Sharma General Store". Remaining jargon removed from app strings (67f7106). Gates green: landing e2e 150/150, SEO e2e 96/96. Phase gate: work committed, HANDOFF §8e updated, owner's Mac fast-forwarded.
- **29 Sep, Phase 2 research.** Committed: `research/{lending,library,gym,hospitality,candidates-and-competitors,shared-engines}.md` (267aa82, 4d798a8, e19ede2, 42e4732, 601973f). Findings:
  - The shared engines are confirmed: recurring dues (two modes), bookings/resources and check-ins.
  - Blocking cross-module questions for architecture: held deposits, taxable dues raising sales documents, party roles per module, and allocating payments to dues.
- **29 Sep, owner decisions (CR-2026-09-29-PLATFORM-D):**
  - Coaching & tuition is added as a module.
  - The landing page presents all modules with no Live/Planned labels.
  - Pricing is hidden on the landing page for now.
- **29 Sep, Phase 1 revision (CR-2026-09-29-PLATFORM-D), landing page rebuilt to those decisions:**
  - Six modules, every one the same card, with no status chip or wording anywhere (the cards, FAQ, metadata and JSON-LD). `status` stays in `config/modules.ts` and is not rendered.
  - Shop & billing shows its real recording through `media`. The other five show an illustration made from our own icons, with no invented screens. Giving a module its recordings is one config line.
  - Coaching & tuition is the sixth module, with copy from `research/coaching.md`.
  - Pricing is hidden (`SHOW_PRICING` off). There is no section, no nav or footer link, no "What does it cost?" and no JSON-LD offers. The section is a `dynamic()` chunk and its strings are a separate catalogue, so `/` does not carry them.
  - New **"Why YourKhata"** section (#why, in the nav): eight "often elsewhere → with YourKhata" points drawn from the competitor research. It names no competitor and makes no ranking claim, and each point is backed by a live capability or a binding rule (`config/why.ts`). "Also included" was reshuffled so it does not repeat the Why points.
  - The title now reaches all six modules: "YourKhata: bills, fees, collections and bookings in one app".
  - Gates: unit tests 2591/2591; landing e2e 169/169; SEO e2e 104/104; contrast OK; i18n in step. The `/` budget was re-baselined 36 → 38 KB (measured 37.1), with a dated note.
  - Open for the owner: the Why and coaching copy need review. The pre-launch gate below now matters, because five of the six modules shown are not built.
- **29 Sep, owner correction (amendment to CR-2026-09-29-PLATFORM-D): Coaching & tuition removed.** The owner said "I need library mgmt system, not coaching". Library stays, as it always has.
  - The module is gone from the vision map (§2, where it is noted under Candidates as declined), `config/modules.ts`, the landing copy (en and hi), the map, cards and FAQ, the SEO title and description, and the JSON-LD.
  - The landing page shows five modules: Shop & billing, Lending & collections, Library, Gym & fitness, Hotel & stays. A test guards that no landing string or metadata names coaching again.
  - `research/coaching.md` is kept for reference, with a NOT IN SCOPE banner.
  - The pre-launch gate still applies: four of the five modules shown are not built.
- **29 Sep, Phase 3 step 1 (architecture owner):** `10-architecture.md`, `11-contracts.md` and ADR-041 to ADR-055 in Part 38 decide the cross-module questions before any FRD is written. All eleven shared-engines questions are decided; none is deferred.
  - Layering: verticals (`apps/lending`, `library`, `gym`, `hospitality`) over engines (`apps/dues`, `bookings`, `attendance`) over core, never sideways. Engines have no ModuleCode; new codes stay hidden behind `UNRELEASED_MODULES` until released.
  - Money: one party balance with a `loan` bucket (aging reads `main` only); held deposits in a `deposit` bucket that never touches the balance; dues allocate through `payments_allocation`; taxable dues and module sales raise sales documents through a core document port.
  - Build order: Wave A core foundations → Wave B Library, dues and attendance engines → Wave C Gym, Lending → Wave D bookings engine, Hospitality.
  - Open for the owner: module roles (agent, trainer, housekeeping), the ID last-4 rule's effect on Form III, lending's allocation default, a reminder window for other modules (`10-architecture.md` §16).

## Pre-launch checklist (before yourkhata.com is public)

- [ ] Every module shown on the landing page is live, or the owner re-confirms the page.
- [ ] Pricing decided and approved (`pricing.ts` status plus the landing flag).
- [ ] Demo films hosted (`NEXT_PUBLIC_DEMO_VIDEO_URL_*`).
- [ ] Staging kept out of search indexes (BACKLOG).
