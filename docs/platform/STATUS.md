# Platform expansion: status

Owner direction of 29 Sep 2026: [00-platform-vision.md](00-platform-vision.md). The phases run strictly in order.

| # | Phase | Status | Output |
|---|---|---|---|
| 1 | Analyse the application; update the landing page to the platform vision | **Built, awaiting owner review** | `01-current-capabilities.md`; landing page (`features/landing`); `config/modules.ts` |
| 2 | Research the modules: lending, library, gym, hospitality, candidates | Not started | `research/*.md` |
| 3 | Module documentation (FRDs) | Not started | `frd/*.md` |
| 4 | Architecture review and reuse map | Not started | `10-architecture.md`, ADRs |
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
| Metadata for `/` | Title 57 chars, description 155, platform-positioned, live capabilities only, no jargon. Absolute canonical `https://yourkhata.com/` from `SITE_URL` (`NEXT_PUBLIC_SITE_URL`); `metadataBase`; Open Graph; Twitter `summary_large_image`; `robots: index, follow, max-image-preview:large` | `src/tests/seo.test.tsx`, `e2e/seo.mjs` |
| Preview card | `public/brand/yourkhata-og.png`, 1200 × 630, K-c lockup + hero headline on indigo, rendered by `scripts/render-brand.mjs --og`. Static on purpose: a root `opengraph-image.tsx` would be inherited by `/d/<token>`, and `next/og` cannot read WOFF2 | both |
| Crawl rules | `robots.txt` allows `/`, `/legal/`, `/login`, `/signup`; disallows every guarded app prefix, admin, `/api/`, `/d/`, onboarding, accept-invite, the password flows, `/design-system`. `sitemap.xml` lists the five public pages | both |
| noindex | Meta on `(app)`, `(admin)`, onboarding, accept-invite, forgot/reset/set-password; `/d/<token>` meta + `X-Robots-Tag` (existing) | both |
| Structured data | One JSON-LD graph: Organization, WebSite, SoftwareApplication (free plan only while pricing is proposed), FAQPage from the rendered FAQ strings. No ratings or reviews | both |
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
