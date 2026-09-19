# Part 38 — Architecture Decision Records

> **Status:** normative. This part is the full expansion of the technology-decisions table in canon §0.4, which lists ADR-001 through ADR-021 as one-line stubs. Where this part and canon §0.4 appear to differ, canon wins on the *decision* and this part is authoritative on the *reasoning, options and consequences*. A decision may only be changed by superseding its record here and amending canon §0.4 in the same change.

## 38.1 How to read an ADR

Every record has the same eight sections and they are not decorative.

**Status** is `Accepted`, `Proposed` or `Superseded`. `Proposed` means the decision is written down and provisionally in force but is waiting on evidence named in Part 37; `Superseded` records carry a pointer to the record that replaced them and are never deleted, because the history of what was rejected is what stops it being re-proposed.

**Context** describes the forces at play for a reader who was not present. It must be intelligible to someone who joins the project in two years, which is the actual audience for an ADR.

**Decision** is one unambiguous sentence, then elaborated. If the sentence needs a qualifier to be true, the decision has not been made.

**Options considered** lists the real alternatives with their genuine advantages — never a strawman. A record whose rejected options have no advantages is a record that did not consider them.

**Consequences** are positive, negative, and neutral-but-notable, and must include *what this decision makes harder later*. A record with only positive consequences is marketing.

**Reversal cost and trigger** states what it would take to change the decision and what would justify doing so. This is the field that distinguishes a decision from a dogma.

**Related** cross-references other records, canon sections, feature IDs, risks in Part 36 and open questions in Part 37.

## 38.2 Numbering, and the conflicts resolved in this part

ADR-001 to ADR-021 are the canon §0.4 set and keep their numbers. ADR-021a is a sub-record, not a new decision: it admits `uuid6` to the ADR-021 allow-list because ADR-009 mandates UUID v7 and PostgreSQL 16 cannot generate it. That sub-record is referenced consistently in Part 20 §20.13.4, Part 26 §13.1 and Part 27 §27.13 and is retained unchanged.

Beyond ADR-021, the architecture and FRD chapters requested new records **without coordinating their numbers**, and three distinct decisions each claimed ADR-022. The conflicts are resolved here as follows. Every reassignment is a documentation defect in the referencing chapter, to be corrected editorially; none changes a decision.

| Claimed as | Decision | Claimed in | Resolved to | Action |
|---|---|---|---|---|
| ADR-022 | Vendor REST APIs over stdlib `urllib.request`; no provider SDKs | Part 17-02 (`PAY-06`, `NTF-02`, `NTF-05`) — 4 references | **ADR-022** | Retained. The most-referenced and broadest claim keeps the number. |
| ADR-022 | In-house XLSX writer and reader instead of `openpyxl` | Part 17-03 (`IMP-02`, `IMP-03`, export framework) — 5 references | **ADR-023** | Part 17-03's five references to ADR-022 must be corrected to ADR-023. |
| ADR-022 | JavaScript barcode decoder fallback (`@zxing/browser`) | Part 17-03 (`INV-10`) — 3 references | **ADR-025** | Part 17-03's three references to ADR-022 must be corrected to ADR-025. Note that the decision is to **decline** the dependency, so the record is `Proposed`, not `Accepted`. |
| ADR-023 | `cryptography` for RFC 8291 Web Push | Part 17-02 (`NTF-04`) — 2 references | **ADR-024** | Part 17-02's two references to ADR-023 must be corrected to ADR-024. |

The remaining new records, ADR-026 to ADR-040, were not numbered anywhere and are assigned here. Several of them record decisions that were made and enforced across the specification without ever being written as decisions — immutability, tenant scoping, the permission registry, cached balances with recompute. They are the most load-bearing records in this part and their absence until now was a genuine gap.

## 38.3 Index

| ID | Title | Status | Layer |
|---|---|---|---|
| ADR-001 | Next.js with the App Router as the frontend framework | Accepted | Frontend |
| ADR-002 | Tailwind plus `ml-uikit` plus a `Ub*` wrapper layer, on re-hued Koper tokens | Accepted | Frontend |
| ADR-003 | React Hook Form with Yup and a central validation-schema hook | Accepted | Frontend |
| ADR-004 | Redux Toolkit with thunks and Axios services; no server-state library | Accepted | Frontend |
| ADR-005 | TanStack Table v8 inside a single `UbDataGrid` | Accepted | Frontend |
| ADR-006 | `react-intl` with ICU messages; `en` and `hi` from the first commit | Accepted | Frontend |
| ADR-007 | Django and DRF as a modular monolith | Accepted | Backend |
| ADR-008 | PostgreSQL 16 in Docker for development and production | Accepted | Data |
| ADR-009 | UUID v7 primary keys with per-tenant human numbering | Accepted | Data |
| ADR-021a | `uuid6` admitted to the allow-list | Accepted | Data |
| ADR-010 | `Decimal` money end to end, transported as strings | Accepted | Data |
| ADR-011 | Mobile plus password authentication with a pluggable OTP adapter | Accepted | Backend |
| ADR-012 | No Celery and no Redis: `platform_job` plus a cron-driven runner | Accepted | Backend |
| ADR-013 | Local `MEDIA_ROOT` through Django's storage API | Accepted | Backend |
| ADR-014 | Client-side PDF through the browser print path | Accepted | Frontend |
| ADR-015 | Messaging as adapters only, with console and deep-link backends | Accepted | Backend |
| ADR-016 | Manual payment recording with locally generated UPI QR | Accepted | Backend |
| ADR-017 | REST under `/api/v1/` with one envelope and idempotency keys | Accepted | API |
| ADR-018 | Structured stdlib logging instead of Sentry, OpenTelemetry or Prometheus | Accepted | Operations |
| ADR-019 | docker-compose as the unit of deployment | Accepted | Operations |
| ADR-020 | PWA-first mobile, staged | Accepted | Frontend |
| ADR-021 | A closed minimal-dependency allow-list | Accepted | Cross-cutting |
| ADR-022 | Vendor REST APIs over the standard library; no provider SDKs | Accepted | Backend |
| ADR-023 | An in-house XLSX writer and reader instead of `openpyxl` | Accepted | Backend |
| ADR-024 | `cryptography` admitted for RFC 8291 and RFC 8292 Web Push | Accepted | Backend |
| ADR-025 | Native `BarcodeDetector` only; no JavaScript decoder | Proposed | Frontend |
| ADR-026 | A hand-written service worker instead of Workbox | Accepted | Frontend |
| ADR-027 | An in-house UPI QR and intent generator | Accepted | Backend |
| ADR-028 | Analytics events to a local table, with no analytics SDK | Accepted | Cross-cutting |
| ADR-029 | An immutable ledger: correction by reversal, never by mutation | Accepted | Data |
| ADR-030 | Immutable stock movements with weighted-average costing | Accepted | Data |
| ADR-031 | Cached balances and stock, with recompute and drift commands | Accepted | Data |
| ADR-032 | Fail-closed tenant scoping with 404 semantics | Accepted | Backend |
| ADR-033 | A permission-codename registry with four fixed system roles | Accepted | Backend |
| ADR-034 | PBKDF2 password hashing rather than Argon2 | Accepted | Security |
| ADR-035 | No list virtualisation at MVP | Accepted | Frontend |
| ADR-036 | Strict typing on financial modules only; no `django-stubs` | Accepted | Backend |
| ADR-037 | Playwright for end-to-end tests, as an allow-list amendment | Accepted | Testing |
| ADR-038 | Manual certificate provisioning for partner domains | Accepted | Operations |
| ADR-039 | In-house WOFF2 validation for partner fonts | Accepted | Frontend |
| ADR-040 | Entitlements and flags as configuration rows, not a flag service | Accepted | Cross-cutting |

---

## ADR-001 — Next.js with the App Router as the frontend framework

**Status:** Accepted · **Date:** 18 September 2026

**Context.** DigiKhaato's frontend must be mobile-first, fast on a 2 GB Android phone over a 3G-equivalent connection, installable as a PWA, capable of rendering public pages (a shared statement, a shared invoice) that are opened by people with no account and no app, and buildable by a very small team reusing an existing internal codebase. Metis Labs already operates the BrandHub Customer Module on Next.js with the App Router, and canon §0.1 names it as the engineering reference for frontend organisation, `ml-uikit` usage, list-page, form and dialog patterns. The choice is therefore not "which framework is best" but "is there a reason to depart from the one the team already knows and whose conventions this specification has already borrowed at file-naming depth".

**Decision.** The frontend is **Next.js with the App Router, on the same major version as BrandHub (16.x), with React 18.3 and TypeScript in strict mode**; `app/**` holds thin route files that are a Suspense wrapper plus a feature-owned page-content component, and all substance lives under `src/modules/DigiKhaato/`.

The App Router is used for routing, layouts, loading and error boundaries, and for server rendering the small number of public pages. It is not used to move business logic to the server: every authenticated page is a client component tree talking to the Django API, because the API is the one authority (canon §0.11 rule 3) and a second data-fetching layer in the Next.js server would be a second place for money to be computed.

**Options considered.**

*Next.js App Router (chosen).* Advantages: the team's existing conventions transfer wholesale, including `AxiosInstances.ts`, `APIPaths.ts`, the redux store shape and the `ds-*` typography plugin; file-based routing removes a class of decision; built-in code splitting per route helps the performance budget; server rendering is available for the public share pages where first paint on a cold link matters; the PWA manifest and service worker (ADR-026) sit naturally in `public/`. Disadvantages: the App Router's server/client boundary is a genuine source of confusion and the specification must be explicit that authenticated pages are client trees; the framework is heavier than the product needs; a framework major upgrade is a project.

*Vite plus React Router.* Advantages: smaller, faster development builds, no server/client boundary to explain, fewer framework concepts. Disadvantages: no server rendering for the public share pages without adding one; the team's conventions do not transfer, so the BrandHub reuse argument — which is worth several weeks — evaporates; route-level code splitting becomes a manual discipline. Rejected because the reuse argument dominates at this team size, not because the technology is worse.

*Remix.* Advantages: excellent form and mutation ergonomics that would suit a data-entry product. Disadvantages: no internal precedent, a different data-loading model that conflicts with ADR-004's single Redux pattern, and a smaller hiring and reference surface in this team's context. Rejected on precedent.

*A server-rendered Django frontend with HTMX.* Advantages: one language, one deployment, no API-versus-UI duplication, and genuinely fast on cheap devices. Disadvantages: the PWA install and offline story becomes much harder (ADR-020), the white-label runtime theming of Part 24 is awkward, `ml-uikit` cannot be used at all, and the team's frontend expertise is not in this shape. Rejected, though it is the option that would most reduce total system complexity and deserves to be recorded as having been seriously considered.

**Consequences.**

*Positive.* Frontend structure is settled before the first commit and is checkable against an existing repository. Route-level splitting supports the performance budget without per-feature work. Public share pages render server-side, which matters because they are opened from a WhatsApp message on a cold connection.

*Negative.* The App Router's conventions must be taught, and the "everything authenticated is a client component" rule must be enforced by review because the framework invites the opposite. Next.js is a large dependency whose upgrade cadence the project does not control, and a major version bump is unavoidable work. Build times on a small machine are not trivial.

*Neutral but notable.* This decision makes a later move to a lighter stack harder in proportion to how much App Router-specific structure accumulates. Keeping business logic out of `app/**` — which the file-layout convention in canon §0.10 already mandates — is what keeps that cost bounded, because the route files are the only Next-specific code.

**Reversal cost and trigger.** Reversal means rewriting routing, layouts and the public pages — roughly two to three weeks at MVP size, growing with the number of routes. It would be justified by a Next.js major version that breaks the client-component model this product depends on, or by build and deployment cost becoming a genuine operational burden on the single-machine deployment of ADR-019.

**Related.** ADR-002, ADR-004, ADR-014, ADR-020, ADR-026, ADR-035; canon §0.1, §0.10; Part 19.

---

## ADR-002 — Tailwind plus `ml-uikit` plus a `Ub*` wrapper layer, on re-hued Koper tokens

**Status:** Accepted · **Date:** 18 September 2026

**Context.** The product needs a visual language that reads as trustworthy financial software to an Indian small-business owner, works in bright daylight on a cheap phone screen, renders Devanagari correctly, can be re-themed per white-label partner at runtime (Part 24), and can be built by one or two people without a design team. Three assets already exist: the **Koper Design System** with a complete token set (spacing, radius, elevation, motion, typography roles, component principles, content rules); **`ml-uikit`**, Metis Labs' shadcn/Radix-based `ML*` primitive library, which carries the accessible behaviour of dialogs, sheets, popovers, selects, tables and toasts; and the **BrandHub Customer Module's** design-system component template, which shows how app-level wrappers are structured. Koper's own visual identity — a copper primary on a dark-first "ink" canvas — is wrong for this product: a billing application used in a shop needs a light canvas, and the category's users associate blue with business software because that is what Zoho, Tally and every banking app look like.

**Decision.** The UI is built as **three layers with fixed responsibilities**: Koper's tokens define what things look and behave like, with the copper primary replaced by a Zoho-style blue and the dark-first canvas inverted to light-first (dark retained as an optional theme); `ml-uikit`'s `ML*` components provide accessible behaviour and are styled through CSS variables and Tailwind classes but never forked; and app-level `Ub*` components in `src/design-system/` carry product patterns, created only when a pattern recurs in at least two features.

Tailwind CSS v3.4 is the utility layer that binds them: Koper tokens are exposed as CSS variables and mapped into `tailwind.config.js`, and the compound `ds-*` typography classes follow BrandHub's plugin approach with Koper's type roles. Koper's brand faces (Clash Grotesk/Clash Display) are replaced by Inter with a Noto Sans Devanagari fallback and IBM Plex Mono, self-hosted via `next/font/local`, because the Clash faces are licensed brand files with no Devanagari coverage.

**Options considered.**

*The three-layer stack (chosen).* Advantages: accessibility comes from `ml-uikit` rather than from discipline; the token indirection is exactly the mechanism white-label theming needs, so ADR-002 and Part 24 are the same decision seen twice; the font substitution keeps Koper's type *roles* while gaining Indic coverage; nothing is forked, so `ml-uikit` upgrades are absorbable. Disadvantages: three layers is three places to look when something renders wrong, and the rule about when a `Ub*` wrapper is justified has to be policed.

*MUI (Material UI).* Advantages: enormous component coverage, mature data grid, strong accessibility, and a theming system. Disadvantages: a very large runtime, an emotion/styled-engine dependency that conflicts with the Tailwind utility model, a visual identity that is recognisably Material and reads as a consumer app rather than business software, and — decisively — it is not what the reference codebase uses, so none of the BrandHub patterns transfer. Canon §0.4 says "no MUI" for these reasons.

*Unstyled headless primitives (Radix or Headless UI) with bespoke styling.* Advantages: total control, minimum runtime. Disadvantages: this is what `ml-uikit` already is, one layer down; rebuilding it means owning the behaviour of every dialog and select. Rejected as a duplication of an internal asset.

*Koper as shipped, dark-first with copper.* Advantages: zero re-hue work; a distinctive identity. Disadvantages: a dark-first financial interface is hard to read in a shop at midday on a cheap screen with a fingerprinted surface, and copper reads as lifestyle rather than ledger. Rejected on user context, not on taste.

**Consequences.**

*Positive.* One UI foundation, enforced as constraint C7 in Part 18 §18.10. Runtime theming per partner is a CSS-variable swap rather than a build, which is what makes `WLB-05` cheap. Devanagari renders correctly by construction rather than by later repair.

*Negative.* The `Ub*` layer will be under constant pressure to grow; the two-feature rule (canon §0.11 rule 7) is the only defence and it needs review enforcement. Self-hosted variable fonts are a real payload on a 3G connection and must be subset. Koper's motion and elevation tokens were designed for a dark canvas and several need re-tuning for light, which is small but real work.

*Neutral but notable.* Committing to `ml-uikit` couples the product to an internal library's release cadence. That is acceptable while Metis Labs owns both; it would be a liability if the product were ever spun out, which is the scenario in which this decision would be revisited.

**Reversal cost and trigger.** Replacing `ml-uikit` means reimplementing the behaviour of roughly fifteen primitives — weeks, not days, but bounded because the `Ub*` layer is the only consumer. Replacing the token layer is a stylesheet change. The trigger would be `ml-uikit` becoming unmaintained, or a partner requiring a component set the library cannot express.

**Related.** ADR-001, ADR-005, ADR-014, ADR-035, ADR-039; Part 23; Part 24 §24.2; `WLB-01`, `WLB-05`.

---

## ADR-003 — React Hook Form with Yup and a central validation-schema hook

**Status:** Accepted · **Date:** 18 September 2026

**Context.** Almost every screen in this product is a form, several are line-item editors with dynamic arrays, and every validation message must exist in English and Hindi. Validation rules recur across features — a mobile number, a GSTIN, an amount, an HSN code, a date that may be backdated but not future — and duplicating them per form guarantees they will diverge. BrandHub already solves this with React Hook Form, Yup resolvers and a central `useValidationSchemas.ts` exposing i18n-aware validators.

**Decision.** Forms use **React Hook Form with Yup through `@hookform/resolvers/yup`**, and every reusable rule lives in `src/hooks/useValidationSchemas.ts` as an i18n-aware validator factory (`mobileValidation()`, `gstinValidation()`, `amountValidation()`); Formik is not used.

**Options considered.** *RHF + Yup (chosen):* uncontrolled inputs mean fewer re-renders on a slow device, which matters for the line-item editor; Yup schemas are composable and readable; the resolver boundary keeps the schema independent of the form library; BrandHub precedent. Disadvantage: Yup's TypeScript inference is weaker than Zod's and schema-to-type alignment must be asserted rather than derived. *RHF + Zod:* better inference, smaller runtime, but Zod is not on the ADR-021 list and the BrandHub validators are Yup — rejected on precedent, not on merit; if the allow-list were being written fresh, Zod would be the stronger choice and this record says so. *Formik:* controlled by default, heavier re-render cost on the exact screens that matter, and explicitly excluded by canon §0.4. *Hand-rolled validation:* no dependency, and guarantees divergence between the client's rules and the server's messages.

**Consequences.** *Positive:* one place to change a rule; validation messages route through the same `useTranslation()` path as everything else, so a missing Hindi message is a missing-key warning rather than an English string leaking into a Hindi UI. *Negative:* the central hook becomes large and must be organised by domain before it becomes a dumping ground; Yup's inference weakness means a schema and its TypeScript type can drift silently. *Neutral:* client validation is a convenience only — canon §0.11 rule 3 puts the authority server-side, so a divergence is a UX defect, never a data defect.

**Reversal cost and trigger.** Swapping Yup for Zod is a mechanical rewrite of the schema hook plus a resolver change, perhaps three days at MVP size and growing linearly with schema count. Trigger: type-drift defects appearing more than once, or a Yup maintenance lapse.

**Related.** ADR-004, ADR-006, ADR-010, ADR-021; canon §0.10; Part 19; Part 25.

---

## ADR-004 — Redux Toolkit with thunks and Axios services; no server-state library

**Status:** Accepted · **Date:** 18 September 2026

**Context.** The product has genuine client state (the active tenant, the white-label theme, a single toast channel, the session) and a large amount of server state (lists, detail records, reports). The industry default in 2026 is to split these: a server-state library such as TanStack Query for the latter, a small store for the former. The reference codebase — BrandHub Customer — does not do this: it uses Redux Toolkit for both, with a per-feature `redux/<x>Slice.ts` and `redux/<x>Thunk.ts` pair where the thunk calls `api/<x>Service.ts`. The question is whether to adopt the better-factored pattern or the one that already exists.

**Decision.** **Redux Toolkit exactly as BrandHub Customer does it** — per-feature slice and thunk files, `createAsyncThunk` calling a thin service module, typed `RootState` and `AppDispatch`, selectors co-located, and cross-feature slices (`snackbarSlice`, `whiteLabelSlice`, `sessionSlice`) in `src/redux/slice/` — with **TanStack Query not used**. HTTP goes through Axios instances in `src/api/AxiosInstances.ts` with a cookie-Bearer interceptor and `handleAxiosError`, and endpoint constants in `src/api/APIPaths.ts`.

**Options considered.** *RTK with thunks only (chosen):* one data-layer pattern throughout, which Part 18 §18.10 C6 states as a constraint — "one pattern, consistently applied, is worth more than a better pattern applied twice"; every request funnels through one Axios boundary, which is what makes the error envelope, the request id and the mock boundary for tests (Part 28: mock the service module, no `msw`) all single-point; full BrandHub transfer. Disadvantages: cache invalidation, background refetch, stale-while-revalidate and request deduplication are all hand-written or absent; list state after a mutation is refetched explicitly, which is more code per feature. *TanStack Query for server state plus RTK for client state:* genuinely better at the server-state problem, less boilerplate per list, automatic deduplication. Rejected because it means two mental models in one codebase for a team of one or two, and because the BrandHub patterns would then transfer only halfway — the worst of both. *RTK Query:* one library, both jobs, and a real candidate. Rejected because it is a different pattern from BrandHub's thunks, so the reuse argument fails identically, and because its generated-hook model sits awkwardly with the explicit service layer that the error handling depends on.

**Consequences.** *Positive:* one pattern; one HTTP boundary; predictable file layout per feature; tests mock one module. *Negative:* more boilerplate per list feature, and no free caching — a list revisited within seconds refetches unless the slice deliberately holds it. Over-fetching on navigation is the most likely performance defect this decision produces, and it must be watched against the `RSK-03` budgets. *Neutral:* the absence of a query cache makes the offline read-through cache of ADR-020/ADR-026 the *only* caching layer, which is simpler to reason about than two.

**Reversal cost and trigger.** Introducing a server-state library later would mean converting features one at a time and living with two patterns during the transition — the exact condition this decision exists to avoid. The honest trigger is a measured, repeated over-fetching problem that slice-level caching cannot fix, and the honest response is to convert *all* list features in one release rather than incrementally.

**Related.** ADR-001, ADR-003, ADR-005, ADR-017, ADR-021; Part 18 §18.10 C6; Part 19; Part 28; `RSK-03`.

---

## ADR-005 — TanStack Table v8 inside a single `UbDataGrid`

**Status:** Accepted · **Date:** 18 September 2026

**Context.** The product has roughly a dozen list screens — parties, items, invoices, purchase bills, payments, expenses, ledger entries, audit rows, reports — each needing sorting, column visibility, row selection, pagination and an export hook, and each needing to render as a card list on mobile and a table on desktop. Building each independently produces a dozen inconsistent tables; building a bespoke grid produces a small unmaintained framework. BrandHub has already solved this with `BrandHubDataGrid` over TanStack Table.

**Decision.** All tabular data renders through **one `UbDataGrid` component, a port of `BrandHubDataGrid`, built on TanStack Table v8**; no feature renders a `<table>` of its own.

**Options considered.** *TanStack Table v8 inside one wrapper (chosen):* headless, so it composes with `ml-uikit` primitives and Tailwind rather than fighting them; column definitions are data, which makes the mobile card renderer a second consumer of the same definition rather than a parallel implementation; the BrandHub port is largely mechanical. Disadvantage: TanStack Table is a real API surface to learn, and its flexibility invites per-feature divergence unless the wrapper is the only entry point. *A styled grid component (MUI DataGrid, AG Grid):* far more capability out of the box — grouping, virtualisation, editing. Rejected because both are large dependencies with their own visual identity, both conflict with ADR-002's single UI foundation, and the capabilities that justify them (in-cell editing, pivoting, million-row virtualisation) are things this product deliberately does not do. *Plain `<table>` per feature:* no dependency, and guarantees twelve inconsistent implementations of column visibility.

**Consequences.** *Positive:* one place to fix a sorting bug, one place to add a bulk-action affordance, one column-definition shape that the CSV/XLSX exporters can consume. *Negative:* `UbDataGrid` accumulates props and becomes the most complex component in the codebase; its API must be designed deliberately rather than grown. *Neutral but notable:* choosing a headless table and then declining virtualisation (ADR-035) means the grid is simple today and would need a virtualiser added rather than swapped if row counts ever demanded it — which is the cheap direction.

**Reversal cost and trigger.** Replacing the table engine behind an unchanged `UbDataGrid` API is days, precisely because every feature goes through the wrapper. That property is the main reason the wrapper exists. Trigger: a requirement TanStack Table cannot express, which at this product's ambitions is unlikely.

**Related.** ADR-002, ADR-023, ADR-035; canon §0.11 rule 7; Part 19.

---

## ADR-006 — `react-intl` with ICU messages; `en` and `hi` from the first commit

**Status:** Accepted · **Date:** 18 September 2026

**Context.** The owner-operator in this market is typically 45–54 years old and more than half of small businesses report that finding and setting up digital tools is hard; the ledger-cluster competitors ship ten to thirteen languages while the billing-cluster competitors collect "missing multilanguage support" as a standing complaint (Part 11 §11.2). Vernacular parity across the *whole* product — the invoice form and the stock adjustment reasons, not just the ledger — is a stated differentiator, and it is a discipline cost paid continuously rather than a project. Retrofitting i18n into a mature billing UI is a months-long job with nothing visible at the end.

**Decision.** Internationalisation uses **`react-intl` with ICU message syntax**, wrapped in a `useTranslation()` hook as in BrandHub, with `locales/en.json` and `locales/hi.json` complete for every user-visible string **from the first commit**; a missing key is a build-visible warning and a release blocker (Part 18 §18.13 R5).

**Options considered.** *`react-intl` (chosen):* ICU handles plurals, gender and number/date formatting, which matters because Indian digit grouping (lakh/crore) and dd/mm/yyyy dates are product requirements rather than preferences; BrandHub precedent; the message-extraction tooling makes missing keys detectable. Disadvantage: ICU strings are verbose and the provider adds a render layer. *`i18next`:* larger ecosystem, richer plural rules, good React bindings — a genuine alternative rejected only on precedent. *Next.js built-in routing-based i18n:* solves URL locale, not message formatting; insufficient alone. *Ship English first, translate later:* the option most teams take. Rejected explicitly: this is the decision that cannot be deferred, because every string written without a key is a string that must be found again.

**Consequences.** *Positive:* a third language (`OQ-08`) is a translation job, not an engineering project. Number and date formatting are centralised, so Indian grouping is correct everywhere or nowhere. *Negative:* every string costs two entries and every PR is slightly slower; Hindi strings for financial vocabulary need native review, because machine translation of "credit", "debit", "due" and "balance" is frequently wrong in a way that only an accountant notices. *Neutral:* the key namespace becomes a design artefact and needs a convention before it has a thousand entries.

**Reversal cost and trigger.** Swapping the library is a mechanical transform of message files plus the `useTranslation()` implementation — days. There is no plausible trigger to reverse the *policy* of two locales from day one; that is the part that cannot be undone cheaply.

**Related.** ADR-002, ADR-003; canon §0.11 rule 6; `OQ-08`; `RSK-07`; Part 23 §23.2.2.

---

## ADR-007 — Django and DRF as a modular monolith

**Status:** Accepted · **Date:** 18 September 2026

**Context.** The backend's hardest problems are transactional: a sales invoice must, in one atomic step, allocate a document number, write lines, deduct stock, post a ledger entry against the party, update a cached balance and write an audit row. A payment must allocate across documents, post a ledger entry, update document statuses and caches. These are exactly the problems that distributing services makes worse. Against that, the product has thirteen distinct modules and a stated ambition that a partner might one day want one of them separately.

**Decision.** The backend is **one Django 5.2 LTS project on Python 3.12 with Django REST Framework, containing one Django application per product module**; applications communicate by importing each other's service and selector functions, never each other's views, serializers or querysets, and never over the network.

**Options considered.** *Modular monolith (chosen):* one transaction boundary spanning ledger, stock and documents, which is the single most valuable property available; one deployable, one migration graph, one test run; app boundaries are seams that could later become deployables. Disadvantage: the boundaries are enforced by convention and review, not by the network, so they erode unless the dependency rules are policed. *Microservices:* independent scaling and deployment; rejected outright — distributed transactions across ledger and stock would have to be solved with sagas and compensations, which is enormous complexity bought to serve a scale this product does not have and an organisational shape (many teams) it will never have. *A single unstructured Django app:* fastest to start; rejected because the module map of canon §0.3 is also the entitlement boundary, the permission boundary and the white-label module-toggle boundary, so the structure is load-bearing product logic, not tidiness. *FastAPI or Django Ninja:* async and faster serialisation; rejected because DRF's viewset, permission and filter machinery is what the tenant-scoping, permission-registry and pagination conventions are built on, and because no part of this workload is I/O-bound enough to want async.

**Consequences.** *Positive:* `transaction.atomic()` genuinely means atomic across modules; a single deploy; the whole product runs from one image. *Negative:* the import rules need a lint or review check or `sales` will eventually import `ledger`'s serializers; one slow endpoint can starve workers shared with fast ones. *Neutral but notable:* choosing a monolith makes independent scaling of a hot module impossible without the extraction work — which is exactly the trade `RSK-08` describes and Part 29 §29.10's ladder addresses in order.

**Reversal cost and trigger.** Extracting one app into a separate deployable means replacing its in-process service calls with an HTTP contract and accepting eventual consistency at that boundary — weeks, and only tolerable for a module with no transactional coupling to the ledger (`reports`, `notifications` and `help` qualify; `sales` and `payments` never will). Trigger: a partner requiring physical isolation of a module, or a scaling wall that Part 29 §29.10's earlier rungs cannot clear.

**Related.** ADR-008, ADR-012, ADR-017, ADR-019, ADR-032; canon §0.3, §0.11 rule 4; `RSK-08`; Part 20 §20.1.

---

## ADR-008 — PostgreSQL 16 in Docker for development and production

**Status:** Accepted · **Date:** 18 September 2026

**Context.** The product needs one datastore that supports exact decimal arithmetic, `jsonb` for settings and mode breakups, partial indexes, `FOR UPDATE SKIP LOCKED` for job claiming, trigram search for party and item lookup, and database-level enforcement of ledger immutability. It also needs the development environment to be identical to production, because the failures this product cannot afford — a rounding difference, a lock behaviour, a constraint that fires in one environment and not the other — are exactly the failures that environment divergence produces.

**Decision.** The datastore is **PostgreSQL 16 running in Docker in both development and production**, with a shared schema, a `tenant_id` column on every business row, fail-closed application-level scoping (ADR-032), and optional row-level security as a Phase 2 addition.

SQLite is not used anywhere, including tests.

**Options considered.** *PostgreSQL in Docker, dev and prod (chosen):* one engine, one set of semantics; Postgres-only features become usable rather than avoided; `numeric` gives exact decimal arithmetic, which ADR-010 depends on absolutely; the container is what makes ADR-019's four-service compose file a complete deployment. Disadvantage: developers pay a container's memory cost, and a Postgres major upgrade is an operational event. *SQLite for development and tests, Postgres in production:* much faster tests and zero setup. Rejected decisively — SQLite's type affinity, its different locking, its lack of `SKIP LOCKED` and its different constraint behaviour mean a test suite that passes on SQLite proves nothing about the system that ships. For a product whose correctness claim is its differentiator, this is not a trade worth making at any speed. *Schema-per-tenant or database-per-tenant:* stronger isolation by construction. Rejected because migrations across thousands of schemas are an operational burden out of proportion to a team of one or two, and because cross-tenant reporting for `PLT-14` and partner consoles becomes hard; the 404-semantics scoping of ADR-032 plus Phase 2 RLS gives most of the benefit. *MySQL or a managed proprietary engine:* no `jsonb` equivalent of the same quality, weaker partial-index support, and no advantage that offsets it.

**Consequences.** *Positive:* development and production are the same system; the immutability triggers of ADR-029 exist in every environment; `numeric(14,2)` money is exact everywhere. *Negative:* the test suite is slower than an in-memory alternative and needs transaction-rollback discipline to stay tolerable; the single database is also the single point of loss (`RSK-11`). *Neutral:* the shared-schema choice means tenant isolation is a property of code and (later) RLS, not of the database's structure — which is why ADR-032 is a separate, load-bearing record.

**Reversal cost and trigger.** Changing engines is a migration of every table plus every Postgres-specific query — months. Moving from containerised to managed Postgres is a connection-string change and is the expected first step of Part 29 §29.10's ladder. Adopting RLS is `OQ-20`.

**Related.** ADR-007, ADR-009, ADR-010, ADR-019, ADR-029, ADR-031, ADR-032; canon §0.11 rule 2; `OQ-20`; `RSK-08`, `RSK-11`; Part 21.

---

## ADR-009 — UUID v7 primary keys with per-tenant human numbering

**Status:** Accepted · **Date:** 18 September 2026

**Context.** Identifiers appear in URLs, in share links sent over WhatsApp, in exports and in support conversations. Sequential integers make every object enumerable, which in a multi-tenant product holding receivables is an IDOR waiting to be found (threat T2 in Part 27 §27.1.4). Random UUIDs solve that but scatter B-tree inserts across the index, which on a write-heavy ledger table costs measurably. Separately, merchants and the GST rules need *human* numbers — consecutive, per financial year, at most sixteen characters — which is a different problem with a different answer.

**Decision.** Every primary key is a **time-ordered UUID v7**, generated in Python; human-facing document numbers come from **per-tenant, per-kind, per-financial-year sequences** in `platform_document_sequence` and are never the primary key.

**Options considered.** *UUID v7 (chosen):* unguessable on the wire, time-ordered so inserts stay at the right edge of the index, and sortable by creation without a second column. Disadvantage: PostgreSQL 16 has no `uuidv7()`, so generation is in Python and requires the `uuid6` package (ADR-021a); 16 bytes per key costs index size against a bigint. *UUID v4:* same unguessability, no ordering — rejected on index-locality cost on the two highest-volume tables (`ledger_entry`, `inventory_stock_movement`). *BIGSERIAL:* smallest and fastest, and immediately enumerable; rejected on T2. *BIGSERIAL internally with a public UUID column:* the best of both on paper; rejected because it doubles the key surface, every foreign key must choose one, and the mapping becomes a permanent source of bugs for a benefit this product's volumes do not need. *ULID:* equivalent properties, but a non-standard type in Postgres and another dependency.

**Consequences.** *Positive:* no enumeration surface anywhere; ids are safe in logs and share links; creation order is derivable from the key, which is useful in replay-based recomputation (ADR-031). *Negative:* ids are unreadable in support conversations, which is why document numbers exist and why support tooling must search by them; one dependency (ADR-021a). *Neutral:* generating keys in the application rather than the database means an object has its id before it is saved, which simplifies building linked rows in one transaction.

**Reversal cost and trigger.** Changing the key type is a full-database migration touching every foreign key — effectively a rewrite. There is no realistic trigger; this is one of the decisions that must simply be right at the start.

**Related.** ADR-008, ADR-021a, ADR-031; canon §0.6; Part 27 §27.1.4 T2; Part 21.

---

## ADR-021a — `uuid6` admitted to the allow-list

**Status:** Accepted · **Date:** 18 September 2026 · **Sub-record of ADR-021**

**Context.** ADR-009 mandates UUID v7 primary keys. PostgreSQL 16 cannot generate them, and ADR-021's backend allow-list contains no UUID library. Either the dependency is admitted, the key type changes, or v7 generation is written in-house.

**Decision.** **`uuid6` is admitted to the ADR-021 backend allow-list**, as the single addition, solely to provide `uuid7()`.

**Options considered.** *Admit `uuid6` (chosen):* a tiny, dependency-free package implementing the RFC 9562 layouts; the exact scope needed and nothing more. *Write v7 in-house:* roughly thirty lines of timestamp and randomness packing, and genuinely feasible; rejected narrowly because getting the monotonic-counter sub-millisecond behaviour right is fiddly and a wrong implementation degrades to v4's index behaviour silently — which is the worst outcome, since the whole point of v7 was locality. *Use v4 and drop the dependency:* see ADR-009. *Wait for PostgreSQL 18's native `uuidv7()`:* the correct long-term answer and unavailable now; it is the reversal trigger.

**Consequences.** *Positive:* ADR-009 is implementable without in-house cryptographic-adjacent code. *Negative:* the allow-list is no longer literally the list in canon §0.4, which is why this sub-record exists rather than a silent addition — the value of a closed list is entirely in its being documented. *Neutral:* the dependency has no transitive dependencies, so the supply-chain surface added is one package.

**Reversal cost and trigger.** Trivial: when the deployment moves to a PostgreSQL version with native `uuidv7()`, the default can move to the database and the package removed, with no schema change. That is the trigger.

**Related.** ADR-009, ADR-021; Part 20 §20.13.4; Part 26 §13.1; Part 27 §27.13.

---

## ADR-010 — `Decimal` money end to end, transported as strings

**Status:** Accepted · **Date:** 18 September 2026

**Context.** This product computes tax. A binary floating-point representation of ₹1,234.55 is not ₹1,234.55, and the error compounds across line totals, tax splits, document totals and report aggregations. The failure is not theoretical: it is how a GST summary comes to differ from a sales register by eleven paise, which is a reconciliation the merchant's accountant cannot close. JSON compounds the problem, because a JSON number parsed by JavaScript is an IEEE 754 double regardless of how the server generated it.

**Decision.** Money and quantities are **`Decimal` in every code path** — models, services, serializers, reports and tests — stored as `numeric(14,2)` for money, `numeric(14,3)` for quantities and `numeric(14,4)` for unit costs, and **transported in JSON as strings** (`"1234.50"`); rounding is half-up, applied at line level and again at document level per the GST rules. `float` appears nowhere, including report aggregation.

**Options considered.** *Decimal with string transport (chosen):* exactness end to end, and the string boundary means the client physically cannot parse a total into a lossy type by accident. On the client, `decimal.js-light` handles the preview arithmetic. Disadvantage: every serializer, every client formatter and every test fixture must handle strings, which is friction on every single field. *Decimal server-side, JSON numbers on the wire:* removes the friction and reintroduces the bug at the last possible moment, invisibly. Rejected. *Integer minor units (paise):* exact, fast, and a legitimate alternative used widely in payments. Rejected because quantities carry three decimals and unit costs four, so a single minor-unit scale does not fit the whole domain, and because `numeric` gives the same exactness without the mental overhead of a scale factor on every read. *Float with rounding at the edges:* the default many products reach; rejected on the compounding argument above.

**Consequences.** *Positive:* the GST summary reconciles to the sales register to the rupee, which is release criterion R2. Rounding is a stated rule rather than an emergent behaviour. *Negative:* pervasive friction — string parsing on the client, `Decimal` construction in every test, and a class of bug where a string is concatenated rather than added. *Neutral but notable:* the string boundary makes API responses slightly larger and makes naive client charting code fail loudly, which is preferable to failing quietly.

**Reversal cost and trigger.** None contemplated. Reversing this is reintroducing a defect class the product's differentiation depends on avoiding.

**Related.** ADR-008, ADR-017, ADR-030; canon §0.11 rule 3; `RSK-12`; Part 18 §18.3.1 G4.

---

## ADR-011 — Mobile plus password authentication with a pluggable OTP adapter

**Status:** Accepted · **Date:** 18 September 2026

**Context.** Merchants in this market will not fill sign-up forms; their identity is the phone number they already give customers, and every competitor uses mobile OTP. But OTP requires a DLT-registered SMS provider with a two-to-four-week lead time (`OQ-03`), and the product must be usable — including by its own developer, locally — before that exists. Meanwhile staff members log in repeatedly on a shared counter device, where waiting for an SMS every session is intolerable.

**Decision.** Authentication is **mobile number plus password, with OTP verification available through the same pluggable SMS adapter that all messaging uses** (`ConsoleSmsBackend` prints the code in development and wherever no provider is configured); sessions are SimpleJWT access tokens of 15 minutes plus rotating refresh tokens of 30 days, both in httpOnly cookies, with the active tenant carried as a claim.

**Options considered.** *Mobile + password with pluggable OTP (chosen):* nothing blocks on a provider contract, which is the dependency rule of Part 18 §18.11 applied to the most critical flow; password login is fast for staff on a shared device; OTP is available for sign-up, recovery and step-up (`PLT-06`) the moment a provider exists. Disadvantage: passwords in this segment will be weak and reused, which is threat T4 and is why throttling, generic errors and progressive lockout are specified. *OTP only:* matches the category and removes password handling entirely; rejected because it makes the product unusable without a provider and imposes an SMS round trip on every session. *Email plus password:* many target users have no working email. *Social or Google sign-in:* no DLT dependency and good security; rejected because it does not match the identity users have, and because it introduces an external dependency into the one flow that must never fail. *Passkeys:* the best long-term answer; rejected at MVP because device support in the target install base is uneven and recovery for a merchant who breaks a phone would be the most-contacted support topic.

**Consequences.** *Positive:* no launch dependency on a provider; step-up OTP is available for sensitive actions without a second mechanism; refresh rotation with family revocation covers stolen-token replay (T5). *Negative:* password reset without a working SMS channel is a support process, not a self-serve flow — a real gap in any deployment where OTP is not configured; credential stuffing is a live threat requiring the Part 27 §27.4.2 controls. *Neutral:* the active tenant living in a claim means switching business re-issues tokens, which is the correct behaviour and must not be cached around.

**Reversal cost and trigger.** Adding passkeys alongside is additive and cheap. Removing passwords entirely once OTP is reliable is a migration plus a support-process change. Trigger for the latter: a measured credential-stuffing incident, or DLT registration proving durable across all deployments.

**Related.** ADR-015, ADR-034, ADR-033; canon §0.8; Part 27 §27.4; `OQ-03`; `PLT-01`, `PLT-02`, `PLT-06`, `PLT-09`.

---

## ADR-012 — No Celery and no Redis: `platform_job` plus a cron-driven runner

**Status:** Accepted · **Date:** 18 September 2026

**Context.** The product has real background work: reminder scans at D-1 and D0, a nightly overdue-status refresh, low-stock scanning, export generation, message sending with retries, and drift-detection jobs. The reflex answer is Celery with Redis. That answer costs two more services in the deployment, a broker whose durability semantics must be understood, a result backend, a separate worker image, and — critically — two more things a partner's security review asks about and a single operator must keep running. Against that, the total background workload at MVP scale is minutes of CPU per day.

**Decision.** There is **no Celery and no Redis**; deferred and scheduled work is written as rows in `platform_job` through an `enqueue(task, payload)` abstraction and drained by an idempotent `manage.py run_scheduler` command, run as a compose `scheduler` service (or by cron).

Every scheduled task is a management command and every task is required to be idempotent, which is what makes replay and multiple runners safe.

**Options considered.** *Table plus runner (chosen):* zero new infrastructure; the job queue is in the same database as the data, so enqueueing is transactional with the work that caused it — a property Celery with Redis does not give you without effort, and one that matters a great deal when the enqueue accompanies a ledger write; jobs are inspectable with SQL; `FOR UPDATE SKIP LOCKED` makes multiple runners safe when needed. Disadvantages: no mature ecosystem of retries, rate limits, chains and beats — each is hand-written; the runner polls, so latency is bounded by the loop interval; a long task blocks its runner. *Celery with Redis:* mature, well-understood, scales horizontally out of the box. Rejected on operational cost against a workload that does not need it, and on Part 11 §11.2's explicit argument that a product running on one VPS with no managed services is sellable into places a Kubernetes-plus-Redis-plus-S3 product cannot enter. *Celery with the database as broker:* combines Celery's API with no Redis; rejected because the database-broker path is the least-exercised part of Celery and inherits its operational complexity without its main benefit. *`django-q` or similar:* closer to this design and a genuine candidate; rejected because it is a dependency doing something a hundred lines already do, and because the abstraction boundary matters more than the implementation.

**Consequences.** *Positive:* two fewer services; enqueue is transactional; the whole job system is debuggable with `SELECT`. *Negative:* retry, backoff, priority and scheduling logic are ours to write and to get right; a saturated runner delays user-visible work (`RSK-10`); there is no dashboard. *Neutral but notable:* because callers only ever see `enqueue(task, payload)`, replacing the runner with Celery later touches zero call sites — which is the entire reason the abstraction exists and is what makes this decision safe rather than merely frugal.

**Reversal cost and trigger.** Low by construction: implement `enqueue` against a broker and run Celery workers; callers unchanged. Trigger: sustained job backlog that multiple runners cannot clear, or a task class needing sub-second latency.

**Related.** ADR-007, ADR-019, ADR-015, ADR-021; Part 18 §18.10 C3; `RSK-10`; Part 20.

---

## ADR-013 — Local `MEDIA_ROOT` through Django's storage API

**Status:** Accepted · **Date:** 18 September 2026

**Context.** The product stores tenant logos, partner branding assets, expense and bill attachments, and generated export files. Object storage is the default modern answer and adds an account, credentials, a dependency (`django-storages` plus `boto3`), a cross-border question under DPDP, and a cost line — for a product whose first deployment is one machine used by one person.

**Decision.** Files are stored on **local disk at `MEDIA_ROOT`, accessed exclusively through Django's storage API**, with images resized through Pillow on upload; an S3-compatible backend is a settings switch only, from Phase 2, and the two call sites that need conditional behaviour are written that way from day one and marked with a `# storage-backend seam` comment.

**Options considered.** *Local disk via the storage API (chosen):* nothing to provision; backup is an rsync alongside the database dump; no third-party data flow to explain in a partner security review or a DPDP assessment; serving is an `X-Accel-Redirect` through the reverse proxy, which is fast and permission-checked. Disadvantages: files are tied to one machine, so a second application host requires the switch; disk is a capacity item nobody monitors until it is full; the media directory must be in the backup and in the restore drill, and is the part most often forgotten. *S3 or compatible from day one:* survives host loss, scales, and serves via signed URLs. Rejected as premature for a single-machine deployment, and because it is one of the "managed services" whose absence Part 11 §11.2 counts as a commercial advantage. *Storing files in the database:* one backup, transactional with the row; rejected on database size and on the cost of streaming large exports through Postgres.

**Consequences.** *Positive:* the four-service compose file is a complete system. Backup is one more path in one script. *Negative:* host loss takes the media with it unless the rsync worked — which makes the restore drill's "open three random attachments" step load-bearing rather than decorative (`RSK-11`, `RSK-20`). Disk exhaustion is a real failure mode requiring monitoring the MVP does not otherwise need. *Neutral but notable:* routing everything through the storage API costs nothing today and is what keeps the future switch to two call sites instead of forty.

**Reversal cost and trigger.** A settings change, a dependency ADR for `django-storages` plus `boto3`, and edits at the two marked seams — a day, plus a migration of existing files. Trigger: a second application host, a partner requiring object storage in their own environment, or media growth outpacing the volume (`OQ-23`).

**Related.** ADR-019, ADR-021, ADR-023; `OQ-23`; `RSK-11`, `RSK-20`; Part 20; Part 29 §29.5.

---

## ADR-014 — Client-side PDF through the browser print path

**Status:** Accepted · **Date:** 18 September 2026

**Context.** Every document in the product — tax invoice, bill of supply, estimate, credit note, purchase bill, receipt, party statement — needs to become paper or a file. Server-side rendering means WeasyPrint or headless Chromium in the production image: system libraries, fonts including Devanagari shaping, memory, and a rendering surface that must be kept in step with the on-screen design. Against that, the browser already has a rendering engine with the right fonts installed, and merchants overwhelmingly share over WhatsApp rather than attach files.

**Decision.** Documents are rendered as **React print components printed through the browser** (`window.print()` / "Save as PDF") with tenant branding, in two templates only — A4 and 80 mm thermal; public share links render the same print view; server-side PDF is deferred to Phase 2 and exists only because automated sending needs a file.

**Options considered.** *Client-side print (chosen):* zero backend dependency; the printed output is by construction the same markup as the screen, so there is one template to maintain rather than two that drift; Devanagari shaping is the browser's problem and the browser is good at it; the public share link and the print view are literally the same page. Disadvantages: output quality varies by browser and printer, pagination control is limited to CSS paged media, and there is no file to attach to an automated message (`RSK-15`). *WeasyPrint server-side:* consistent output, a real file, attachable; rejected at MVP because it is a substantial dependency with Pango/Cairo system libraries in an image whose smallness is a selling point, and because Devanagari shaping quality must be verified rather than assumed. *Headless Chromium server-side:* pixel-identical to the client output by construction, which is genuinely attractive; rejected because a browser in the production image is a very large surface for a single-machine deployment. *A third-party PDF service:* no infrastructure; rejected because documents contain names, amounts and GSTINs and sending them to a third party is a DPDP question nobody wants to answer.

**Consequences.** *Positive:* nothing to deploy; one template per format; the share link is free. *Negative:* print fidelity is not controlled, which is a visible, in-front-of-a-customer failure mode; automated attachment is impossible until Phase 2, so `NTF-05` templates use URL buttons rather than files. *Neutral but notable:* this decision makes scheduled report delivery (`RPT-14`) and emailed invoices harder later, which is precisely why it is staged rather than permanent.

**Reversal cost and trigger.** Adding server-side rendering is additive — the print components' markup is the input — and costs one dependency plus image changes (`OQ-22`). Trigger: a Phase 2 feature that genuinely requires an attachment rather than a link, or field evidence of print failures that CSS cannot fix.

**Related.** ADR-002, ADR-013, ADR-019; `OQ-22`; `RSK-15`; `SAL-03`, `PAY-04`, `NTF-05`; Part 11 §11.4.

---

## ADR-015 — Messaging as adapters only, with console and deep-link backends

**Status:** Accepted · **Date:** 18 September 2026

**Context.** Customer-side messaging is the most-praised behaviour in this category — the customer receives a message when something is written against their name, and disputes disappear. It is also gated on a TRAI DLT registration with a two-to-four-week lead time, a per-message cost of ₹0.12–₹0.25, Meta business verification for WhatsApp, and per-message WhatsApp pricing that has changed twice in eighteen months. No MVP flow can be allowed to block on any of that.

**Decision.** All outbound messaging goes through a **single `MessageBackend` adapter interface with a template registry and a `notifications_message_log`**; at MVP the registered backends are `ConsoleSmsBackend` (writes to the log) and `WaMeBackend` (builds a free `wa.me` deep link); real providers — MSG91/Kaleyra, WhatsApp Cloud API or a BSP, SMTP, Web Push — are Phase 2 implementations of the same interface, selected by configuration only.

Every send attempt is logged with a status, including `skipped` when no provider is configured, so an inert channel is visible rather than silent.

**Options considered.** *Adapter-only (chosen):* the product ships and is usable while contracts are being signed; provider choice becomes configuration, which is what `WLB-06`'s per-partner sender identity needs anyway; the template registry gives one place where the registered DLT form and the sent form agree. Disadvantage: the interface must be right before any caller exists, and a `skipped` status is easy to ignore. *Integrate one provider directly at MVP:* simpler code, and makes launch depend on a contract and a registration — rejected by Part 18 §18.11's dependency rule. *Use a messaging aggregator that fronts SMS, WhatsApp and email:* one integration, and a vendor in the middle of the most compliance-sensitive path in the product, plus a dependency; rejected. *No messaging at MVP:* removes the category's most-praised behaviour.

**Consequences.** *Positive:* nothing blocks; `wa.me` delivers the same message at zero cost with a human tap and needs no approval; per-partner provider selection is already possible. *Negative:* a channel can be inert for months without anyone noticing unless the `skipped` counts are watched (`RSK-18`); building the caller-facing behaviour against a console backend means delivery-path bugs are found late. *Neutral:* the interface constrains what a message can be — a template id plus typed variables — which is exactly what DLT requires and therefore not a limitation in practice.

**Reversal cost and trigger.** None needed; adding a provider is implementing the interface. The real risk is the opposite — a caller bypassing the interface to reach a provider directly, which is a review item.

**Related.** ADR-012, ADR-022, ADR-024; `NTF-02`, `NTF-03`, `NTF-05`, `LED-07`, `LED-08`; `OQ-03`; `RSK-18`, `RSK-19`, `RSK-30`; Part 3 §3.9.

---

## ADR-016 — Manual payment recording with locally generated UPI QR

**Status:** Accepted · **Date:** 18 September 2026

**Context.** The number-one collection complaint in this category is "money debited, ledger not updated". It happens because a static UPI QR carries no party context and nothing calls the merchant's system back. A payment aggregator solves the callback but requires a contract, merchant KYC, settlement responsibility and a webhook surface — none of which can exist at MVP, and all of which raise the question of who is in the money path (`OQ-04`).

**Decision.** At MVP, payments are **recorded manually** — multi-mode, with reference or UTR, allocated to open documents, splittable across modes — and **UPI static and dynamic QR codes and intent links are generated locally from the tenant's own VPA** with no aggregator and no network call; a payment-aggregator adapter (`PAY-06`) and an unmatched-payments queue (`PAY-07`) are Phase 2.

The product states its own limit explicitly: a payment made to a static QR is invisible to the server, and the UI says so and offers a one-field manual path rather than pretending otherwise (principle P7, Part 18 §18.5).

**Options considered.** *Manual plus local QR (chosen):* money never passes through Metis, so there is no settlement liability, no merchant KYC obligation and no regulated surface at MVP; the QR is free to provide and is what a merchant expects to see on an invoice in 2026; the manual UTR entry is one field, not a workaround. Disadvantages: reconciliation is the merchant's work; no automatic posting; the honest admission that the server cannot see the payment is a weaker demo than a competitor's automatic one. *Aggregator from day one:* automatic posting, webhooks, a real reconciliation story; rejected because it makes launch depend on a contract and puts Metis or a partner in the settlement path before anyone has decided who should be (`OQ-04`). *No UPI at all:* rejected; a merchant expects a QR. *Use a third-party QR/payment-link vendor:* a dependency and a data flow for something a local encoder does (ADR-027).

**Consequences.** *Positive:* zero regulatory surface at MVP; nothing to contract; the layered design (dynamic intent with a reference, then the unmatched queue, then manual UTR) means each phase strictly improves on the last without rework. *Negative:* merchants reconcile manually, which is real friction for the highest-volume tenants; the product's honesty about invisible payments must be communicated well or it reads as a limitation rather than integrity. *Neutral but notable:* because `PAY-01`'s manual path is the primary rather than a fallback, the Phase 2 aggregator becomes an accelerant rather than a rewrite.

**Reversal cost and trigger.** Additive: `PAY-06` implements a provider behind the existing payment service. Trigger is commercial, not technical — `OQ-04` deciding who contracts, and a merchant cohort large enough that manual reconciliation is the top complaint.

**Related.** ADR-022, ADR-027; `PAY-01`, `PAY-03`, `PAY-06`, `PAY-07`; `OQ-04`; `RSK-28`; Part 11 §11.2.

---

## ADR-017 — REST under `/api/v1/` with one envelope and idempotency keys

**Status:** Accepted · **Date:** 18 September 2026

**Context.** One frontend, one backend, one team. The API is not a public product at MVP; it is the contract between two halves of one system, with `PLT-13` (tenant API keys and webhooks) raising it to a public surface only in Phase 3. It must be trivially inspectable in a browser and a log, must carry a request id for support, and must be safe against the specific failure that a merchant on a bad connection taps "Save" twice.

**Decision.** The API is **REST over JSON under a single `/api/v1/` prefix**, with `snake_case` keys, page and cursor pagination, one response envelope, one structured error object, and an `Idempotency-Key` header accepted on every POST that creates a document or a payment.

The frontend maps `snake_case` to `camelCase` at the service-module boundary, which is the one place the mapping happens.

**Options considered.** *REST with one envelope (chosen):* every tool understands it; a URL in a log is a reproducible request; DRF's viewset, filter and permission machinery aligns with it exactly, which is what makes tenant scoping and the permission registry one-line concerns per view; idempotency keys solve the double-tap problem at the protocol level rather than per-form. Disadvantages: over-fetching on composite screens (a party page wants party, balance, recent entries and open documents) needs either several requests or purpose-built endpoints; versioning by prefix means a v2 is a fork rather than a gradient. *GraphQL:* solves the composite-screen problem elegantly and gives the client exactly what it asks for; rejected because it adds a dependency and a schema layer, makes per-field permission checking a genuine design problem in a product with a permission registry, and makes caching, logging and rate limiting all harder — for a benefit that one frontend does not need. *RPC-style endpoints:* fine for actions, poor for the resource-shaped majority. *No versioning:* rejected because `PLT-13` will expose this surface to partners and an unversioned public API is a promise nobody can keep.

**Consequences.** *Positive:* uniform error handling and one `handleAxiosError`; idempotency is a header rather than a per-feature invention; the API is greppable. *Negative:* composite screens issue several requests, which interacts with ADR-004's absence of a query cache and must be watched against `RSK-03`'s budgets; purpose-built read endpoints (`/reports/dashboard`, `/parties/{id}/statement`) are the designed answer and must not proliferate into a bespoke endpoint per screen. *Neutral:* the `snake_case`-to-`camelCase` boundary is a small, mechanical cost paid in exactly one place.

**Reversal cost and trigger.** Adding GraphQL alongside would be a second data-layer pattern, which Part 18 §18.10 C6 forbids. A v2 prefix is the supported path for breaking changes. Trigger for a v2: `PLT-13` partners depending on shapes that must change.

**Related.** ADR-004, ADR-007, ADR-010, ADR-032, ADR-033; canon §0.8, §0.11 rule 5; Part 22.

---

## ADR-018 — Structured stdlib logging instead of Sentry, OpenTelemetry or Prometheus

**Status:** Accepted · **Date:** 18 September 2026

**Context.** Observability's default stack — an error tracker, a metrics store, a tracing backend — is three vendors or three more services, each with a data flow that a partner's security review and a DPDP assessment will ask about, on a product whose first deployment is one machine. Against that, a product handling money needs to be able to answer "what happened to this merchant's request" with certainty.

**Decision.** Observability at MVP is **Django's stdlib `logging` emitting structured JSON**, with an in-house middleware attaching `request_id` and `tenant_id` to every line, plus `/system/health` and `/system/version`; Sentry, OpenTelemetry and Prometheus are optional, settings-gated Phase 2 additions and are absent by default.

Analysis is SQL against existing tables (Part 30), because the data that matters — jobs, message logs, audit rows, analytics events — is already in the database.

**Options considered.** *Structured stdlib logging (chosen):* no vendor, no egress, no dependency, and a `request_id` in a JSON line is genuinely sufficient to trace a request through a monolith; the frontend surfaces the same id in its error UI so a merchant's screenshot is a query. Disadvantages: no aggregation, no alerting, no release-over-release error trends, and nobody is watching the logs (`RSK-21`); a client-side exception is invisible unless a user reports it. *Sentry from day one:* excellent, and the single most useful tool for an unattended product; rejected at MVP on the data-flow argument and admitted deliberately as a settings-gated option so that turning it on is a decision rather than a project. *Self-hosted error tracking:* keeps data local at the cost of another service on the same machine. *OpenTelemetry:* right for a distributed system; this is one process.

**Consequences.** *Positive:* nothing to explain in a security review; logs are grep-able and shippable anywhere later; the request-id contract is established from the first commit, which is the part that is expensive to retrofit. *Negative:* no alerting means failures are discovered by users, which is why `RSK-21`'s external uptime check is listed as a pre-launch gap; client errors are invisible; log volume management is manual. *Neutral but notable:* because the id contract exists, adding Sentry later is a configuration change plus a DSN, not an instrumentation project.

**Reversal cost and trigger.** Low: the settings gate exists. Trigger: the first partner deployment, or any month in which more than one incident is discovered by a merchant rather than by the team.

**Related.** ADR-019, ADR-021, ADR-028; `RSK-21`; Part 30; Part 25 §25 error handling.

---

## ADR-019 — docker-compose as the unit of deployment

**Status:** Accepted · **Date:** 18 September 2026

**Context.** The product must be installable by a partner's own operations team, must run on a developer's machine identically to production, and must be sellable into banks and NBFCs whose procurement counts third-party dependencies and whose security review is shorter when there is less to review. It must also, at the outset, run for one person on one machine.

**Decision.** The unit of deployment is a **`docker-compose` stack of four services — `db`, `backend`, `scheduler`, `frontend` (plus a `backup` sidecar) — on a single VPS or a developer's machine**; Kubernetes manifests in the BrandHub `k8s-files` style are reserved for Phase 3 and only when a partner needs scale.

**Options considered.** *docker-compose (chosen):* one file is the whole system; `docker compose up` from a clean checkout is the onboarding and the disaster-recovery procedure; a partner can run it in their own environment, which is what makes `OQ-05`'s partner-hosted option real; the scheduler is the same image with a different command, so there is one build. Disadvantages: no rolling deploy without care, no automatic failover, manual scaling, and a single host is a single point of loss (`RSK-11`). *Kubernetes from day one:* rolling deploys, self-healing, horizontal scale; rejected as vastly disproportionate — it would add a control plane, a registry, manifests, secrets management and an operator's worth of knowledge to a workload that fits on one machine, and it is precisely the shape Part 11 §11.2 argues locks a product out of the partners this one is aimed at. *A managed PaaS:* least operations; rejected because it forecloses partner-hosted deployment and puts the data in an environment the partner has not approved. *Bare processes with systemd:* fewer layers, at the cost of environment parity, which is the property ADR-008 depends on.

**Consequences.** *Positive:* the deployment is a document; development and production are the same; nothing in the stack requires a managed service. *Negative:* deploys have a brief downtime window unless the reverse proxy is used carefully; scaling is vertical until the Part 29 §29.10 ladder is climbed; the operator is a person, not a control plane (`RSK-17`, `RSK-21`). *Neutral but notable:* choosing compose makes multi-host scale-out later a genuine project rather than a configuration change, which is the explicit trade in `RSK-08`.

**Reversal cost and trigger.** Moving to Kubernetes means manifests, an image registry, secrets management and a stateful-set decision for Postgres — weeks, and mostly ops rather than application work, because the images are unchanged. Trigger: a partner requiring it, or the scaling ladder exhausted.

**Related.** ADR-007, ADR-008, ADR-012, ADR-013, ADR-038; Part 18 §18.10 C1; `RSK-08`, `RSK-11`, `RSK-17`; `OQ-05`; Part 29.

---

## ADR-020 — PWA-first mobile, staged

**Status:** Accepted · **Date:** 18 September 2026

**Context.** The product is used at a counter on a phone. Native applications would give camera access, reliable offline behaviour, push on every platform and an app-store presence that Indian merchants associate with legitimacy. They would also mean two more codebases and two release processes for a team that has chosen a minimal dependency policy, and Part 11 §11.3 item 11 excludes them at MVP with a stated trigger.

**Decision.** Mobile delivery is **responsive web plus a PWA manifest (installable, home-screen launch) at MVP with a read-through cache; an offline write queue in Phase 2; Capacitor wrappers at Phase 3 if triggered** — and both the caching and the queue are specified now so the MVP code leaves the right seams.

**Options considered.** *Staged PWA (chosen):* one codebase, one deploy, instant updates with no store review, and install plus home-screen launch cover most of what "an app" means to this user; the service worker (ADR-026) is the same asset the offline queue will use. Disadvantages: iOS support for install and push is weaker; `BarcodeDetector` is unavailable on iOS Safari (ADR-025); some merchants equate "not in the Play Store" with "not real". *Native from day one:* best device integration; rejected on team size and on the absence of evidence that it is needed — Part 18 §18.9 A1 states the assumption and its cost if false (roughly six weeks). *Capacitor from day one:* one codebase in a native shell, store presence, camera and push; a serious option rejected only because it adds a build pipeline, two store accounts and a release process before anyone has shown they are needed. *Responsive web with no PWA:* cheapest; loses install, home-screen launch and any offline story.

**Consequences.** *Positive:* one codebase; updates ship without review; the install prompt is free. *Negative:* no store listing, which is a discovery and credibility cost in this market; camera-dependent flows are browser-dependent; push is Phase 2 and needs ADR-024. *Neutral but notable:* committing to a hand-written service worker now (ADR-026) means the offline queue's semantics (`OQ-21`) are a design decision still owed, and the MVP must not accidentally foreclose it — which is why only append-only writes are contemplated.

**Reversal cost and trigger.** Capacitor wraps the existing build, so the move is a pipeline plus store accounts plus native permission handling — weeks, not a rewrite. Triggers, per Part 11 §11.3 item 11: camera flows proving unusable in the browsers the base runs, or a partner requiring store distribution (`OQ-15`).

**Related.** ADR-001, ADR-024, ADR-025, ADR-026; `OQ-15`, `OQ-21`; Part 19 §19 PWA section.

---

## ADR-021 — A closed minimal-dependency allow-list

**Status:** Accepted · **Date:** 18 September 2026

**Context.** Every dependency is a future migration cost, a supply-chain surface, a line in a partner's security questionnaire and a thing that must be understood when it breaks. This product is built by a very small team, runs for personal use on one machine first, and is sold into organisations that count dependencies. It is also built substantially by an AI coding agent, whose default behaviour is to reach for a library — which makes an explicit, closed list a control rather than a preference.

**Decision.** The permitted third-party libraries are **enumerated exhaustively in canon §0.4** for frontend and backend, runtime and development, and **anything not on that list requires a written, merged ADR before the first install**.

The frontend list is: next, react, react-dom, typescript, tailwindcss, tailwindcss-animate, ml-uikit, class-variance-authority, clsx, tailwind-merge, lucide-react, @reduxjs/toolkit, react-redux, axios, react-hook-form, @hookform/resolvers, yup, @tanstack/react-table, react-intl, dayjs, decimal.js-light, js-cookie, react-dropzone, react-error-boundary; development: eslint, prettier, jest, @testing-library/*, husky. The backend list is: Django, djangorestframework, djangorestframework-simplejwt, psycopg[binary], django-filter, django-cors-headers, Pillow, python-decouple/environs; development: pytest, pytest-django, black, isort, flake8, factory-boy. Amendments to date: ADR-021a (`uuid6`), ADR-024 (`cryptography`, when `NTF-04` is built), ADR-037 (Playwright and `coverage`, development only).

An ADR proposing a dependency must answer six questions (Part 26 §13.2): what it does that we cannot cheaply do; what its transitive surface is; who maintains it and how actively; what the licence is; what happens if it is abandoned; and what the removal path looks like.

**Options considered.** *A closed enumerated list (chosen):* it is checkable — a lint rule and a review can enforce it, and Part 25 §25 encodes specific refusals (`lodash`, `moment`) as ESLint errors; it is the artefact a security reviewer wants; it stops the agent reaching for a package by default. Disadvantages: it forces in-house implementations that a library would do better (`RSK-14`), and a closed list with undocumented exceptions is worse than an open one — which is why ADR-021a and ADR-037 exist as explicit amendments. *A policy without a list ("prefer few dependencies"):* no friction, and no effect. *No policy:* the default, and the reason most products of this size carry six hundred transitive packages. *A vetted-registry approach:* appropriate at a larger organisation; disproportionate here.

**Consequences.** *Positive:* a genuinely small surface; `pip-audit` and `npm audit` findings are few and actionable; the partner security conversation is short; the product remains auditable by one person. *Negative:* in-house replacements carry their own defects (ADR-023, ADR-026, ADR-027, ADR-039 and `RSK-14`); the list will be under continuous pressure and each amendment weakens the argument slightly; occasionally the austere choice is simply wrong, which is what ADR-024 records honestly. *Neutral but notable:* the list's value is in being *documented as closed*, not in being short — a list with three written amendments is stronger than one with three silent ones.

**Reversal cost and trigger.** The policy is not reversed; it is amended, one record at a time. It would be abandoned only if the team grew past the size at which one person can hold the whole dependency surface — which is the point at which its main benefit disappears.

**Related.** ADR-021a, ADR-022, ADR-023, ADR-024, ADR-025, ADR-026, ADR-027, ADR-028, ADR-036, ADR-037, ADR-039; Part 18 §18.10 C2; Part 25 §25, Part 26 §13; `RSK-14`; `OQ-16`, `OQ-17`, `OQ-18`.

---

## ADR-022 — Vendor REST APIs over the standard library; no provider SDKs

**Status:** Accepted · **Date:** 18 September 2026 · *Resolves an ADR-022 numbering collision; see §38.2.*

**Context.** Phase 2 integrates a payment aggregator (Razorpay), SMS providers (MSG91, Kaleyra), the WhatsApp Cloud API and BSP equivalents, and SMTP. Each vendor ships a Python SDK. Each SDK is a dependency outside ADR-021's list, each pulls transitive packages, each has its own release cadence and deprecation policy, and each wraps a REST API that is typically four endpoints.

**Decision.** Every third-party HTTP integration is implemented **directly against the vendor's REST API using the standard library's `urllib.request`**, with explicit timeouts, explicit retry and backoff, and explicit signature verification; **no vendor SDK is added**.

The concrete shape, from `PAY-06`: HTTP Basic auth with `key_id:key_secret`, a 10-second timeout, two retries with 250 ms and 1 s backoff on 5xx and connection errors, and webhook signatures verified with `hmac.new(secret, raw_body, hashlib.sha256)` compared using `hmac.compare_digest`.

**Options considered.** *Stdlib HTTP (chosen):* zero dependencies; the retry, timeout and error behaviour is explicit and identical across providers rather than each SDK's idiosyncratic default; the code is small enough to read in full, which matters when it is in a money path; no SDK deprecation to chase. Disadvantages: `urllib.request` is verbose and its error taxonomy is awkward, so a small shared helper is needed; features an SDK gives free (pagination helpers, typed models) are ours; a vendor API change is ours to notice. *Vendor SDKs:* idiomatic, maintained, handle auth and pagination; rejected because four SDKs is four dependencies plus transitive weight, and because the surface actually used from each is tiny. *`requests` or `httpx` as a single shared client:* one dependency instead of four, far nicer than `urllib`; a genuine and close call, rejected because the stdlib is sufficient for four endpoints per provider and because admitting a general HTTP client invites its use everywhere.

**Consequences.** *Positive:* the allow-list holds through all of Phase 2's integrations; retry and timeout policy is uniform and testable; webhook verification is explicit rather than delegated. *Negative:* more code per integration, and a shared `urllib` helper that must handle redirects, non-2xx bodies and connection errors correctly — a small piece of infrastructure with real edge cases (`RSK-14`). *Neutral:* because every provider is behind ADR-015's adapter interface anyway, the HTTP choice is invisible above the adapter.

**Reversal cost and trigger.** Adopting `httpx` would be a mechanical rewrite of the shared helper — a day. Trigger: a vendor requiring HTTP/2, mTLS or streaming that `urllib` cannot do cleanly.

**Related.** ADR-015, ADR-016, ADR-021, ADR-024; `PAY-06`, `NTF-02`, `NTF-05`; `RSK-14`; Part 17-02.

---

## ADR-023 — An in-house XLSX writer and reader instead of `openpyxl`

**Status:** Accepted · **Date:** 18 September 2026 · *Reassigned from ADR-022; see §38.2.*

**Context.** Accountants want Excel, not CSV — Part 3 §3.11 Finding 8 names Excel as one of four integration surfaces that matter. `RPT-08` and `IMP-02` must export XLSX at MVP and `IMP-03` must import it in Phase 2. `openpyxl` is the obvious library and is outside ADR-021's list.

**Decision.** XLSX is produced by an **in-house minimal writer** (`imports/writers/xlsx_writer.py`, standard-library `zipfile` plus generated SheetML) and consumed by an **in-house minimal reader** (`imports/parsers/xlsx_reader.py`, `zipfile` plus streaming `xml.etree.ElementTree`); `openpyxl` is not added.

The writer supports one sheet, a bold frozen header row, column widths and three number formats (`#,##0.00` money, `#,##0.000` quantity, `dd/mm/yyyy` date) chosen by `ColumnSpec.type`, and streams rows without holding more than one chunk. The reader supports the first worksheet or one named `Data`, shared and inline strings, numeric, boolean and date cells resolved through the workbook's number formats and the 1900/1904 epoch flag including the 1900 leap-year quirk, formula cells read as their cached value, and merged cells read as the top-left value with a warning. It explicitly rejects `.xls` (`legacy_excel_format`), encrypted workbooks (`encrypted_file`) and formulas without a cached value (`formula_without_value`).

**Options considered.** *In-house (chosen):* no dependency; a streaming writer with bounded memory, which a default `openpyxl` write does not give; a documented, closed input envelope so unsupported files produce a clear message rather than a traceback. Disadvantages: date epochs, shared strings and number formats are real edge cases to own, and a file that Excel opens but Google Sheets refuses is ours to diagnose (`RSK-14`). *`openpyxl`:* a decade of edge cases already found, much richer reading; rejected under ADR-021 with the reversal trigger stated below — this is the live subject of `OQ-16`. *CSV only:* simplest, and loses the accountant surface the product is trying to win.

**Consequences.** *Positive:* exports stream, so a 200,000-row report does not need the memory to hold it. *Negative:* an input envelope narrower than merchants' real spreadsheets. *Neutral:* both components sit behind narrow module boundaries, so the swap is local.

**Reversal cost and trigger.** A day plus an ADR. Trigger: two or more real merchant files failing for reasons outside the documented rejection list that cannot be fixed cheaply (`OQ-16`).

**Related.** ADR-021, ADR-005; `IMP-02`, `IMP-03`, `RPT-08`; `OQ-16`; `RSK-14`.

---

## ADR-024 — `cryptography` admitted for RFC 8291 and RFC 8292 Web Push

**Status:** Accepted · **Date:** 18 September 2026 · *Reassigned from ADR-023; see §38.2.*

**Context.** `NTF-04` (web push, Phase 2) requires payloads encrypted per RFC 8291 (`aes128gcm`, which needs P-256 ECDH and HKDF) and requests signed per RFC 8292 (VAPID, which needs ECDSA over P-256). Python's standard library provides `hashlib`, `hmac`, `secrets` and `base64` but no elliptic-curve primitives.

**Decision.** **`cryptography` is admitted to the ADR-021 backend allow-list, solely for `NTF-04`'s RFC 8291 and RFC 8292 implementation**, and enters the requirements file in the same commit as the feature, never speculatively. `pywebpush` and vendor push SDKs are not added; the implementation lives in `notifications/providers/webpush.py` behind ADR-015's `MessageBackend` interface.

**Options considered.** *Admit `cryptography` (chosen):* correct, audited primitives; the name a partner's security reviewer recognises as a mitigation rather than a risk. Disadvantage: a large dependency with a compiled component, complicating the build image and creating a real patch-tracking obligation. *Hand-roll P-256 ECDH and ECDSA:* rejected outright and recorded as rejected so it is never re-proposed — writing elliptic-curve arithmetic for a production financial product is a defect, not a trade-off, and this is the one place where ADR-021's austerity is explicitly overridden on safety grounds. *`pywebpush`:* does exactly this job; rejected because it is a larger surface that itself depends on `cryptography`, so the dependency is incurred either way with less control. *Drop `NTF-04`:* viable, and the fallback if push never earns its place — re-engagement then rests entirely on SMS and WhatsApp, both of which carry per-message cost and policy risk.

**Consequences.** *Positive:* push is implementable correctly and standards-only, with no vendor and no data leaving the deployment. *Negative:* one large dependency and a heavier image; a precedent that the allow-list can be amended, which must stay rare. *Neutral but notable:* admitting `cryptography` also makes stronger password hashing available, which is a **separate** decision that must not be taken silently (ADR-034).

**Reversal cost and trigger.** Removing it means dropping `NTF-04`. Trigger for not adopting it at all: `NTF-04` failing to justify itself against messaging cost at Phase 2 (`OQ-17`).

**Related.** ADR-015, ADR-020, ADR-021, ADR-026, ADR-034; `NTF-04`; `OQ-17`; Part 17-02.

---

## ADR-025 — Native `BarcodeDetector` only; no JavaScript decoder

**Status:** **Proposed** · **Date:** 18 September 2026 · *Reassigned from ADR-022; see §38.2.*

**Context.** `INV-10` (barcode scanning, Phase 2) needs to read EAN-13/8, UPC-A/E, Code 128, Code 39 and QR from a phone camera. Browsers expose `BarcodeDetector` natively on Android Chrome; iOS Safari does not implement it. A JavaScript decoder such as `@zxing/browser` closes the gap at the cost of a dependency outside ADR-021's list and several hundred kilobytes.

**Decision.** `INV-10` ships **native-only**: it uses `BarcodeDetector` where available and otherwise shows "Camera scanning not supported on this browser — type the code or use a USB scanner"; **no JavaScript decoder is adopted**. The record's status is `Proposed` rather than `Accepted` because the decision is explicitly waiting on evidence (`OQ-19`), not because the behaviour is undecided — the behaviour ships as stated.

**Options considered.** *Native only (chosen):* no dependency, no bundle cost, and the hardware path (USB or Bluetooth scanner acting as a keyboard, which `useScannerListener` already supports) covers the counter case that matters most for a wholesaler. Disadvantage: every iOS user is excluded from camera scanning, which is a visible gap. *Admit a JS decoder, lazily loaded on the scanner route:* closes the gap; costs a dependency and introduces decode-accuracy variance with camera and lighting that native detectors handle better. *Capacitor for the scanning flow only:* best scanning quality; pulls ADR-020's Phase 3 trigger forward for one feature.

**Consequences.** *Positive:* zero cost until evidence justifies it. *Negative:* an unsupported message is a poor experience and will generate support contacts from iOS merchants. *Neutral:* because the decoder would be lazily loaded on one route, adopting it later changes nothing else.

**Reversal cost and trigger.** Hours plus an ADR amendment. Trigger: iOS share of the active base with scanning intent proving material once `INV-10` ships (`OQ-19`).

**Related.** ADR-020, ADR-021; `INV-10`; `OQ-19`; Part 17-03.

---

## ADR-026 — A hand-written service worker instead of Workbox

**Status:** Accepted · **Date:** 18 September 2026

**Context.** ADR-020 requires an installable PWA with a read-through cache at MVP and an offline write queue in Phase 2. Workbox is the standard toolkit and is outside ADR-021's list. A service worker is also the single most dangerous piece of code in a web application: a bad one serves stale assets indefinitely and cannot be fixed by deploying, because the fix itself is served from the stale cache.

**Decision.** One service worker at `public/sw.js`, **written by hand**, scope `/`, registered from a `ServiceWorkerRegistrar` in the app shell **after first paint and only in production**; Workbox is not added.

The MVP scope is deliberately narrow: precache the build's static assets keyed by build id, network-first for API requests with no offline fallback, cache-first for hashed static assets, and an explicit update-and-reload path so a new build always wins.

**Options considered.** *Hand-written (chosen):* roughly a hundred lines that can be read in full, which for code with this failure mode is the decisive argument; no build-time generation step; no dependency. Disadvantages: Workbox's well-tested strategies, expiration plugins and navigation-preload handling are ours to write, and cache-invalidation bugs here are unusually expensive. *Workbox:* battle-tested strategies and a generation step that keys the precache manifest to the build automatically; a genuinely strong option rejected on ADR-021 and on the fact that MVP needs two strategies, not twelve. *`next-pwa`:* wraps Workbox with Next-specific configuration; same rejection plus an extra layer. *No service worker:* loses install and offline reads entirely, and forecloses the Phase 2 queue.

**Consequences.** *Positive:* small, auditable, no build coupling. *Negative:* the update path must be right on the first attempt — a stale-cache bug in production is recovered only by an unregister-and-reload path that must itself be shipped in advance; this is the highest-consequence in-house component in the product (`RSK-14`). *Neutral:* the same worker is the substrate for the Phase 2 write queue (`OQ-21`) and for Web Push (ADR-024), so it must be designed for three jobs even though it does one at MVP.

**Reversal cost and trigger.** Adopting Workbox is a rewrite of one file plus a build step — a day. Trigger: a second cache-invalidation incident, or the offline queue proving too intricate to hand-write safely.

**Related.** ADR-001, ADR-020, ADR-021, ADR-024; `OQ-21`; `RSK-14`; Part 19.

---

## ADR-027 — An in-house UPI QR and intent generator

**Status:** Accepted · **Date:** 18 September 2026

**Context.** `PAY-03` shows a UPI QR on invoices, receipts and a collect screen, generated from the tenant's own VPA with no aggregator (ADR-016). Producing it needs two things: a UPI intent URI built to the NPCI parameter spec, and a QR matrix encoder. Both are well-specified and small; both would otherwise be a dependency (`qrcode`, `segno`, or a frontend QR library).

**Decision.** UPI intent URIs and their QR representations are **generated in-house** — a pure-Python QR encoder on the server emitting SVG, and a matching `UbQrCode` component on the client — with **no QR library and no network call**.

**Options considered.** *In-house (chosen):* QR encoding for the byte mode at the error-correction level a payment code needs is a contained, fully-specified algorithm with abundant conformance vectors; keeping it local means a QR can be rendered offline and on a share page with no third-party request; SVG output scales to both the 80 mm thermal template and A4 without raster artefacts. Disadvantages: an encoder is a few hundred lines with real bit-level detail, and a wrong mask or error-correction choice produces a code that scans on one phone and not another. *Add a QR library:* trivially correct and one dependency in each of two runtimes. *A hosted QR image service:* rejected immediately — it would send a VPA and an amount to a third party on every invoice render. *Render QR only on the client:* halves the work, but the server needs it for `GET /payments/qr.svg` and for share pages.

**Consequences.** *Positive:* no dependency, no egress, offline-capable, and vector output. *Negative:* correctness must be established by scanning with at least two real UPI applications as an acceptance step, not by unit tests alone (`RSK-14`, `RSK-28`). *Neutral:* because the intent-URI builder is separate from the encoder, an NPCI parameter change touches one small function.

**Reversal cost and trigger.** Hours plus an ADR. Trigger: a scan-failure pattern the in-house encoder cannot resolve.

**Related.** ADR-016, ADR-021, ADR-022; `PAY-03`; `RSK-14`, `RSK-28`.

---

## ADR-028 — Analytics events to a local table, with no analytics SDK

**Status:** Accepted · **Date:** 18 September 2026

**Context.** Part 31 defines a full event catalogue, and Part 18 §18.12.2 argues that instrumenting after launch leaves the first cohort unmeasured, which is when measurement matters most. Every analytics product — Segment, Mixpanel, PostHog, GA — is an SDK, a data flow to a third party, and a DPDP disclosure.

**Decision.** Analytics events are **written to a local table** by a thin client hook and a server-side emitter, with **no third-party analytics SDK**; events carry `tenant_id`, `user_role` and `surface`, never personal data, and amounts only as buckets (`<100`, `100-999`, `1k-9k`, `10k-99k`, `1L+`).

Feature flags and entitlements are likewise rows, not a flag service (ADR-040). Client performance vitals are collected from `PerformanceObserver` directly rather than by adding `web-vitals`.

**Options considered.** *Local table (chosen):* for a product whose first deployment is one machine, a table is faster to query than any SDK's export, costs nothing, ships no data to a third party, and is the correct substrate to *replay from* if a real provider is added later; it also means the DPDP and partner-review answer is "none leaves the deployment". Disadvantages: nobody self-serves a funnel from SQL, so the analysis burden falls on whoever writes queries; there is no session replay, no cohort tool, no dashboard. *A hosted analytics SDK:* rich tooling immediately; rejected on the data-flow and dependency arguments. *Self-hosted open-source analytics:* keeps data local; rejected at MVP as another service on the single machine, and retained as the leading Phase 2 option (`OQ-24`). *No instrumentation at MVP:* rejected explicitly by Part 18 §18.12.2.

**Consequences.** *Positive:* events exist from day one, are testable, and are replayable. No third-party surface. *Negative:* insight requires someone to write SQL, and if nobody does, the events are dead weight — which is why a small set of saved funnel views is a pre-launch item. *Neutral but notable:* the event table grows and needs a retention policy alongside the DPDP work of `OQ-10`.

**Reversal cost and trigger.** Adding a sink is a consumer of an existing table; history replays. Trigger: `OQ-24` at Phase 2 entry.

**Related.** ADR-018, ADR-021, ADR-040; Part 31; `OQ-24`, `OQ-10`; Part 18 §18.12.2.

---

## ADR-029 — An immutable ledger: correction by reversal, never by mutation

**Status:** Accepted · **Date:** 18 September 2026

**Context.** The second-most-common complaint across this whole category is data integrity: balances that change, entries that vanish after an update, "cost me thousands" reviews (Part 11 §11.2). The product's central claim is a ledger trustworthy enough to settle a dispute between a merchant and a customer who remember the amount differently. That claim is only true if the record cannot quietly change.

**Decision.** `ledger_entry` rows are **immutable**: they are never updated and never deleted. A correction posts a **reversal** of the original plus a **replacement** linked by `supersedes_id`, with a mandatory typed reason and an audit row; a void posts a reversal; the statement offers a toggle to show or hide corrections. Enforcement is at both layers — no code path performs an update, and a database trigger refuses one.

**Options considered.** *Immutable with reversal (chosen):* the record of what was believed at each moment survives, which is what makes a dispute settleable and what makes the data underwriting-grade for a lending partner; balances become a pure function of an append-only series, which is what makes ADR-031's drift detection possible at all; a competitor with mutable rows cannot retrofit this without rewriting every historical balance, which Part 11 §11.2 counts as defensibility. Disadvantages: a correction produces two visible rows where users expect an edit, so the UI must explain it; a mass correction is expensive and alarming (`RSK-09`); the table grows faster. *Mutable rows with an audit trail:* the common design; the audit trail is in a different table, is rarely shown to users, and is exactly what "the balance changed and I do not know why" complaints are made of. *Soft delete:* the worst of both — a deleted row still participates in nothing and the sum depends on a flag everyone forgets. *Event sourcing proper, with no cached balances:* philosophically the same and operationally heavier; rejected in favour of immutable rows plus caches (ADR-031).

**Consequences.** *Positive:* zero balance drift is testable; every change is attributable; the statement is evidence. *Negative:* correction UX must be designed rather than assumed; mass corrections need a runbook that does not yet exist (`OQ-25`); storage grows monotonically and archival is a future question. *Neutral but notable:* immutability makes a future accounting projection possible — journals can be derived retrospectively from `entry_type` — which is the one thing Part 40 reserves.

**Reversal cost and trigger.** None contemplated. Removing immutability would invalidate the product's differentiation and every drift guarantee built on it.

**Related.** ADR-030, ADR-031, ADR-008; canon §0.11 rule 1; `LED-03`, `PLT-08`; `RSK-09`, `RSK-12`; `OQ-25`; Part 11 §11.2.

---

## ADR-030 — Immutable stock movements with weighted-average costing

**Status:** Accepted · **Date:** 18 September 2026

**Context.** Stock must be correct under backdated entries, voided documents, returns and adjustments, and the segment's accountants expect a costing method they recognise. Every costing method other than weighted average requires knowing *which* units left, which means lot tracking, which means a different movement shape.

**Decision.** `inventory_stock_movement` rows are **immutable signed quantity changes**; on-hand is their sum, a reversal is an opposite movement referencing `reverses_id`, and costing is **weighted average only** — purchase bills update `avg_cost`, outbound movements never change the average, and valuation is on-hand times average cost.

**Options considered.** *Immutable movements, weighted average (chosen):* the "outbound never changes the average" property is what makes recomputation a *pure replay* — iterate movements in `(movement_date, created_at, id)` order, apply the same function, and the result is deterministic, which is the foundation of ADR-031's drift detection; weighted average survives backdated entries without a rebuild; `PUR-08` landed cost extends the same average. Disadvantages: one method for everyone, which Part 18 §18.9 A6 records as an assumption about accountants that has not been tested (`OQ-14`); no lot-level cost, so batch-level margin analysis is impossible. *FIFO:* what many accountants prefer and what batches (`INV-16`, Phase 3) would naturally support; rejected at MVP because it requires lot tracking on every movement, which changes the movement shape that Part 13 §13.7 forbids changing later. *Standard costing with variance:* a manufacturing method for a segment that is not primarily manufacturing. *Per-tenant method:* the contingency if `OQ-14` resolves against weighted average, and a Class C change of significant size.

**Consequences.** *Positive:* zero stock drift is testable on the 100,000-row dataset; backdated purchases do not corrupt history; valuation is one multiplication. *Negative:* no method choice; a tenant whose accountant insists on FIFO cannot be served. *Neutral but notable:* Phase 3 batches introduce lot identity, and the record deliberately does not promise that batch costing will remain weighted average at that point — that is a decision to be made then, not assumed now.

**Reversal cost and trigger.** Large: a movement-shape change plus a valuation-engine change plus a migration of existing stock into lots. Trigger: `OQ-14` resolving that the segment's accountants reject it.

**Related.** ADR-029, ADR-031, ADR-010; canon §0.11 rule 1; `INV-08`, `PUR-01`, `PUR-08`, `INV-16`; `OQ-14`; Part 21 §21.3.6.

---

## ADR-031 — Cached balances and stock, with recompute and drift commands

**Status:** Accepted · **Date:** 18 September 2026

**Context.** ADR-029 and ADR-030 make balance and on-hand derivable by summing immutable events. Deriving them on every read is correct and too slow: `LED-01` budgets 100 ms to open a party's ledger drawer and the party list shows a balance for every row. A cache is unavoidable; a cache that can silently disagree with the truth is exactly the failure the immutability design exists to prevent.

**Decision.** `parties_party.balance` (with receivable and payable totals) and `inventory_item_stock` (on-hand and average cost per item and location) are **denormalised caches maintained inside the same transaction as the event write**, with a **single recomputation authority** — `recompute_party_balance` and `recompute_item_stock`, which replay from the events — used both by the nightly drift jobs (`recalc_balances`, `recalc_stock`) and by their `--fix` path.

The drift jobs report and exit non-zero when drift exists; without `--fix` they change nothing. `LED-01` T-11 (10,000 random entries, zero drift) and the 100,000-row release gate are the tests.

**Options considered.** *Cache plus a replay authority plus drift detection (chosen):* fast reads, and a cache that can always be repaired from a source that cannot be wrong; one definition of "correct", used by both the checker and the fixer, which is what prevents the classic failure where the repair tool and the monitor disagree. Disadvantages: every new code path that writes an event can forget the cache update, which is the whole of `RSK-13`; two writes per event. *Compute on read with database aggregates:* always correct, and misses the 100 ms budget on a party with thousands of entries. *Materialised views:* correct and refreshed asynchronously, so the merchant sees a stale balance immediately after posting — unacceptable for the product's core interaction. *Increment the cache blindly on document changes:* fast and unrepairable; explicitly rejected, which is why Part 20 requires document caches to be *recomputed* from the authority rather than incremented.

**Consequences.** *Positive:* budgets are met; drift is detected nightly rather than by a merchant; repair is genuinely a repair. *Negative:* discipline is required on every new event-writing path; the drift job must actually be watched. *Neutral:* the replay authority is also the natural place a future accounting projection would hook in.

**Reversal cost and trigger.** Low in principle — the caches are derivable — but removing them would break the performance budget. No trigger contemplated.

**Related.** ADR-029, ADR-030, ADR-008; `LED-01`, `INV-08`; `RSK-13`, `RSK-03`, `RSK-12`; Part 20.

---

## ADR-032 — Fail-closed tenant scoping with 404 semantics

**Status:** Accepted · **Date:** 18 September 2026

**Context.** ADR-008 puts every tenant's rows in one shared schema distinguished by `tenant_id`. That makes cross-tenant data access threat T1 — the highest-consequence, most-repairable-only-once failure in the product — a property of application code. A forgotten filter in one view leaks another merchant's receivables.

**Decision.** Tenant scoping is **fail-closed by default and enforced at three points**: `TenantScopedViewSet` applies the tenant filter unless a view explicitly opts out; `TenantPrimaryKeyRelatedField` refuses a foreign id at deserialisation; and a request for an object belonging to another tenant returns **404, never 403**. No tenant in context means no data, never all data. An exhaustive route-coverage test asserts that every registered route is either tenant-scoped or explicitly listed as public.

**Options considered.** *Explicit fail-closed base classes plus 404 (chosen):* the default is safe, so the mistake is failing to opt out of safety rather than failing to opt in; 404 rather than 403 means an attacker cannot use the response code to confirm that an id exists, which is the difference between a probe and an enumeration; the route-coverage test converts "did we remember" into a build failure. Disadvantages: the opt-out exists and can be misused; 404 semantics make legitimate debugging slightly harder. *Implicit scoping via thread-local middleware and a global manager:* less code per view and genuinely magical — a query in a management command or a job silently returns nothing or everything depending on context. Rejected because the failure mode is invisible. *Row-level security only:* strong, and deferred to Phase 2 as defence in depth (`OQ-20`) rather than as the primary, because an RLS-only design fails confusingly when a session variable is unset. *403 for cross-tenant ids:* more honest to a legitimate user, and an enumeration oracle.

**Consequences.** *Positive:* the invariant is defended by defaults and by a test rather than by attention. *Negative:* the opt-out list must be reviewed; 404s in logs need the request id to diagnose. *Neutral:* adding RLS later is additive and does not change any of this.

**Reversal cost and trigger.** None contemplated; this is one of the two invariants Part 27 §27.2 names as unrepairable if breached.

**Related.** ADR-007, ADR-008, ADR-017, ADR-033; canon §0.11 rule 2; Part 27 §27.1.4 T1, T2; `OQ-20`; `RSK-16`.

---

## ADR-033 — A permission-codename registry with four fixed system roles

**Status:** Accepted · **Date:** 18 September 2026

**Context.** Staff roles without a desktop licence are a stated differentiator (Part 11 §11.2), and the product must distinguish "may post an entry" from "may correct one" and "may override a credit limit". Custom roles (`PLT-12`) are Phase 3. The design question is what the primitive is, and whether the MVP ships roles or permissions.

**Decision.** Permissions are **string codenames in the format `<module>.<resource>.<action>`** with actions drawn from a closed set (`read`, `write`, `delete`, `approve`, `export`, `manage`), enumerated exhaustively in canon §0.9 and enforced identically in the API and the UI; MVP ships **four fixed system roles** — `owner`, `admin`, `staff`, `accountant` — as named bundles of those codenames.

`HasPermission` **denies any action it has no mapping for**, so a new endpoint merged without a permission entry fails closed rather than opening. Permissions are re-read from the database on each request and a `ver` claim invalidates tokens on role change.

**Options considered.** *Codename registry with role bundles (chosen):* the codenames are the primitive, so `PLT-12` is a UI over data that already exists rather than a redesign; four roles is small enough that the matrix can be stated once and tested exhaustively for every write endpoint; deny-by-default converts a forgotten mapping into a bug report. Disadvantages: the codename list is another thing to keep in step with the endpoint list; four roles will not fit every business ("our cashier should not see reports" is answered by `staff`, which already cannot, but not every such question resolves so neatly). *Roles only, with permissions hard-coded per view:* simpler now and impossible to extend without touching every view. *Full ABAC or per-object permissions from the start:* maximum flexibility, disproportionate complexity, and a permission model nobody can reason about in a support call. *Django's built-in model permissions:* nearly right, but tied to models rather than to product actions like `ledger.entry.correct`.

**Consequences.** *Positive:* one matrix, tested for all four roles on every write endpoint (release criterion R4); `PLT-12` is cheap when it comes. *Negative:* per-membership exceptions are not supported, which is exactly what `OQ-07` asks about; the registry must be maintained. *Neutral:* entitlements (plan gating, ADR-040) are a separate axis from permissions (role gating) and are deliberately not merged, because a feature can be absent because the plan excludes it or because the role forbids it, and the two messages differ.

**Reversal cost and trigger.** Additive. `PLT-12` and any per-membership flag build on the same codenames.

**Related.** ADR-011, ADR-032, ADR-040; canon §0.9; `PLT-05`, `PLT-12`, `PTY-06`; `OQ-07`; Part 27 §27.5.

---

## ADR-034 — PBKDF2 password hashing rather than Argon2

**Status:** Accepted · **Date:** 18 September 2026

**Context.** ADR-011 uses passwords. Django's default hasher is PBKDF2-SHA256 with a high iteration count; Argon2id is the modern recommendation and requires `argon2-cffi`, outside ADR-021's list. Separately, ADR-024 admits `cryptography` for web push at Phase 2, which makes it tempting to upgrade hashing silently at the same time.

**Decision.** Passwords use **Django's default `PBKDF2PasswordHasher`**; `argon2-cffi` is not added at MVP, and the availability of `cryptography` from ADR-024 does **not** constitute an argument to change hashers — that would be a separate decision requiring its own record.

The compensating controls are explicit: a generic `invalid_credentials` response for both unknown mobile and wrong password, per-mobile and per-IP throttles, progressive lockout, and a breach-list check when a password is set.

**Options considered.** *PBKDF2 (chosen):* zero dependency; FIPS-recognised; Django's iteration default rises each release, so the work factor tracks upstream without action; at this product's threat level the dominant risk is credential stuffing (T4), which no hasher mitigates — throttling and breach checks do. Disadvantages: PBKDF2 is weaker than Argon2id against GPU-accelerated offline cracking should the database ever leak, which is a real if lower-probability scenario. *Argon2id via `argon2-cffi`:* materially better offline resistance and the current consensus recommendation; rejected on ADR-021 at MVP with the trigger below, and recorded so that the choice is visible rather than accidental. *bcrypt:* also needs a dependency, and is not clearly better than a high-iteration PBKDF2. *Password-less (OTP only):* removes the question and creates ADR-011's availability problem.

**Consequences.** *Positive:* no dependency; upgrade path is trivial because Django supports a hasher list and re-hashes on next login. *Negative:* an offline-cracking scenario is worse than it needs to be. *Neutral but notable:* because Django re-hashes on login, adopting Argon2 later migrates the user base passively with no forced reset.

**Reversal cost and trigger.** Adding `argon2-cffi`, putting it first in `PASSWORD_HASHERS`, and letting re-hash-on-login migrate — under a day. Trigger: a partner security review requiring it, or any breach or near-miss touching the user table.

**Related.** ADR-011, ADR-021, ADR-024; Part 27 §27.4.2; `RSK-16`.

---

## ADR-035 — No list virtualisation at MVP

**Status:** Accepted · **Date:** 18 September 2026

**Context.** `UbDataGrid` (ADR-005) renders every list. Page sizes are 25 on mobile (appended) and 25/50/100 on desktop. A virtualiser would render only visible rows and is the reflex answer for long lists; it is also another dependency and a well-known source of scroll-restoration and print bugs.

**Decision.** **No virtualisation at MVP.** One hundred rows of a memoised row component is comfortably within the frame budget on the 2 GB reference device; the policy is revisited only if a real screen exceeds 200 simultaneously rendered rows.

**Options considered.** *No virtualiser (chosen):* no dependency; the DOM contains what the user can print and what the browser can find with Ctrl-F; scroll restoration on back-navigation works by default, which matters because the party list is navigated away from and back to constantly. Disadvantages: a future screen with a thousand rows would stutter. *Add a virtualiser now:* future-proofs a problem that does not exist and breaks printing of long lists, which this product actually does. *Reduce page sizes instead:* would trade render cost for round trips, which on a 3G connection is the worse trade.

**Consequences.** *Positive:* simpler grid, working print and find, working scroll restoration. *Negative:* the day-book with a wide date range is the one screen that could exceed the threshold, and it is paginated specifically because of this decision — a constraint that must not be quietly removed. *Neutral:* adding a virtualiser later is contained to `UbDataGrid`.

**Reversal cost and trigger.** Hours plus an ADR. Trigger: a real screen exceeding 200 rendered rows, measured rather than anticipated.

**Related.** ADR-002, ADR-005, ADR-021; `RSK-03`; Part 19.

---

## ADR-036 — Strict typing on financial modules only; no `django-stubs`

**Status:** Accepted · **Date:** 18 September 2026

**Context.** TypeScript is strict on the frontend by ADR-001. On the backend, Python typing is optional, and `mypy` against a Django codebase is only useful with `django-stubs`, which is a substantial dependency that changes how models are written and is frequently out of step with Django releases.

**Decision.** `mypy` runs in CI as a **non-blocking report for the whole tree and blocking for a named set of strict modules** — the money, tax, ledger, stock and allocation service functions; **`django-stubs` is not added**, and the strict modules are written as plain Python (pure functions over `Decimal`, dates and dataclasses) precisely so they need no Django-aware typing.

**Options considered.** *Strict islands, no stubs (chosen):* the code where a type error costs money is fully typed and checked; the rest gets advisory value at zero cost; keeping the financial core free of ORM types is independently good design, because it makes those functions unit-testable without a database and replayable in the recomputation authority (ADR-031). Disadvantages: two standards in one codebase, and the boundary must be documented or it drifts. *`mypy` with `django-stubs`, strict everywhere:* the strongest guarantee; rejected on dependency weight, on the version-skew maintenance it imposes, and because most of the value concentrates in a small fraction of the code. *No typing at all:* loses the one check that catches a `float` where a `Decimal` belongs, which is precisely `RSK-12`'s failure class. *Runtime validation instead:* catches the same errors later and in production.

**Consequences.** *Positive:* the arithmetic is typed and pure; no stub dependency to maintain. *Negative:* the strict-module list is a thing to keep current as modules are added; views and serializers get no blocking check. *Neutral:* the discipline that keeps financial functions ORM-free is enforced by the typing choice rather than by review, which is a useful side effect.

**Reversal cost and trigger.** Adding `django-stubs` is a dependency ADR plus a long tail of annotation work. Trigger: type-related defects appearing outside the strict modules more than occasionally.

**Related.** ADR-010, ADR-021, ADR-031; `RSK-12`; Part 26 §11, §13.

---

## ADR-037 — Playwright for end-to-end tests, as an allow-list amendment

**Status:** Accepted · **Date:** 18 September 2026

**Context.** Part 28 specifies roughly 35 end-to-end specs run against a real docker-compose stack with a seeded database and no API mocking. It names Playwright with the pre-installed Chromium. Playwright is not in ADR-021's enumerated list, and ADR-021's list includes development tooling (`jest`, `eslint`, `husky`), so the omission is an inconsistency rather than an implied permission (`OQ-18`).

**Decision.** **Playwright is admitted to the ADR-021 allow-list as a development-only dependency**, together with `coverage`, and canon §0.4's ADR-021 row is amended to name them. The principle is stated explicitly: the allow-list covers development tooling as well as shipped code, and every addition is a written amendment.

**Options considered.** *Amend the list (chosen):* keeps the list exhaustive, which is the only property that makes it worth anything to a security reviewer; costs one line. *Read the list as covering shipped code only:* removes the inconsistency by weakening the rule, and leaves a reviewer unable to trust the list. *Drop end-to-end tests:* the flows this product cannot afford to break — post an entry, issue an invoice, record a payment, run an import — are exactly the ones only an end-to-end test exercises across the real stack. *Hand-written HTTP-level smoke tests instead:* cheaper, and cannot exercise the browser behaviour (print view, service worker, form interaction) that several specs exist for.

**Consequences.** *Positive:* the allow-list stays honest; end-to-end coverage of the critical flows exists. *Negative:* Playwright brings a browser download into the development and CI environment, which is a real size and time cost; it must be pinned. *Neutral:* because it is development-only, it never reaches the production image, which is the distinction the amendment records.

**Reversal cost and trigger.** Trivial; it is test tooling. No trigger contemplated.

**Related.** ADR-021, ADR-021a, ADR-024; `OQ-18`; Part 28 §28.6.

---

## ADR-038 — Manual certificate provisioning for partner domains

**Status:** Accepted · **Date:** 18 September 2026

**Context.** `WLB-03` (Phase 2) lets a partner serve DigiKhaato on its own hostname. Each hostname needs a TLS certificate. Automating ACME from the application means adding an ACME client dependency and creating a write path from partner-controlled input (a hostname) into the TLS layer.

**Decision.** Certificate issuance for a partner domain is a **deliberate manual operations step**, gated on hostname verification having already succeeded; ACME automation from within the application is Phase 3 at the earliest and would need its own ADR.

**Options considered.** *Manual issuance (chosen):* partners number at most ~100 with at most a few domains each, so the total is a few hundred one-off operations over years; no dependency; no partner-controlled input reaching certificate issuance; the verification step stays a human gate, which is also a fraud control. Disadvantages: an operations step per domain, which is a real burden on a very small team (`RSK-17`), and renewal must be automated even if issuance is not. *Automated ACME in the application:* self-serve partner onboarding and no ops step; rejected on the dependency and the attack-surface argument, and because self-serve partner domain onboarding is not a Phase 2 requirement. *A reverse proxy with automatic certificate management (Caddy or similar):* automates issuance without application code and is the most likely eventual answer; rejected at Phase 2 only because it changes the deployment's proxy layer, which ADR-019 keeps deliberately plain.

**Consequences.** *Positive:* no dependency, no new write path, a human gate on domain claims. *Negative:* partner onboarding has a manual step with a lead time that must be communicated; renewal automation is still required and is an ops responsibility. *Neutral:* the trade is explicit — one ops step per partner domain against a dependency plus attack surface — and at this scale the ops step wins.

**Reversal cost and trigger.** Adopting an auto-certificate proxy is an ops change, not an application change. Trigger: partner domains passing roughly twenty, or a partner requiring same-day self-serve domain setup.

**Related.** ADR-019, ADR-021; `WLB-03`; `RSK-17`, `RSK-24`; Part 24 §24.

---

## ADR-039 — In-house WOFF2 validation for partner fonts

**Status:** Accepted · **Date:** 18 September 2026

**Context.** `WLB-05` lets a partner supply its own brand font as a WOFF2 file. Two things must be checked before it is served: that the file is actually a font and not a disguised payload, and that its `cmap` covers Devanagari — because a partner uploading a Latin-only brand face would silently break every Hindi screen for that partner's merchants. A font-parsing library would do this and is outside ADR-021's list.

**Decision.** Uploaded WOFF2 files are validated by a **minimal in-house table reader** that verifies the WOFF2 signature and directory and checks `cmap` coverage for the Devanagari range; files are size-capped at 300 kB and served same-origin. No font library is added.

**Options considered.** *In-house reader (chosen):* the check needs the header, the table directory and one table, which is a small and well-specified read; no dependency; the failure is a clear upload-time message ("this font has no Devanagari glyphs") rather than a silent rendering failure in production. Disadvantages: WOFF2's Brotli-compressed table data means reading `cmap` requires decompression, which the standard library provides but which makes the reader less trivial than it sounds; malformed-file handling must be robust because the input is partner-supplied. *A font library (`fontTools`):* correct and complete; rejected under ADR-021 for a check this narrow. *No validation, just serve it:* invites both the security and the Devanagari failure. *Reject custom fonts entirely:* the simplest option, and it removes a partner branding capability that `WLB-05` exists to provide.

**Consequences.** *Positive:* no dependency; a specific, actionable error at upload time; same-origin serving avoids a third-party font CDN. *Negative:* another in-house parser of untrusted input, which is the category `RSK-14` covers and which needs fuzz-adjacent test cases. *Neutral:* the 300 kB cap is also a performance control on a 3G connection, so the limit serves two purposes.

**Reversal cost and trigger.** Adopting `fontTools` is a dependency ADR and an afternoon. Trigger: partner fonts failing validation for reasons the in-house reader cannot diagnose.

**Related.** ADR-002, ADR-006, ADR-021; `WLB-05`; `RSK-07`, `RSK-14`; Part 24 §24.

---

## ADR-040 — Entitlements and flags as configuration rows, not a flag service

**Status:** Accepted · **Date:** 18 September 2026

**Context.** The product needs three kinds of switch: plan entitlements (`PLT-15`) that decide what a tenant has paid for, module toggles that a partner sets for its merchant base, and feature flags for staged rollout. A third-party flag service (LaunchDarkly, Flagsmith and similar) is the conventional answer and is a dependency plus a data flow plus a runtime call in a hot path.

**Decision.** Entitlements, module toggles and feature flags are all **rows resolved through the same three-level chain — Metis default, partner, tenant — as every other piece of white-label configuration** (Part 24 §24.2.2); there is no third-party flag service and no separate flag system.

Partner rows are read on essentially every request and change essentially never (≤ 100 partners), so the resolution cache is aggressive and in-process, with no Redis (ADR-012).

**Options considered.** *Configuration rows on the existing chain (chosen):* one mechanism to understand, one place to look when a merchant asks why a screen is missing, and entitlements and flags resolve identically so there is no question about precedence; no dependency, no egress, no runtime call to a third party; the chain already exists for branding and messaging configuration, so this is reuse rather than construction. Disadvantages: no percentage rollouts, no targeting rules, no flag-change audit UI beyond the general audit log; a flag change is a configuration write, which needs a surface. *A hosted flag service:* real targeting, instant kill switches, a good UI; rejected on dependency, data flow and the fact that a partner security review would ask about it. *Self-hosted flag service:* another service on the single machine for a capability three tables already provide. *Compile-time flags or environment variables:* no per-tenant resolution, which is the entire requirement.

**Consequences.** *Positive:* one resolution chain; entitlements and flags cannot disagree; nothing leaves the deployment. *Negative:* no gradual rollout mechanism, so a risky change ships to everyone or to a hand-picked tenant list; the in-process cache needs an invalidation story on configuration change. *Neutral but notable:* because entitlement (plan) and permission (role, ADR-033) are deliberately separate axes, the UI must be able to say "your plan does not include this" and "your role does not allow this" differently, and the resolution chain is what makes that distinction available.

**Reversal cost and trigger.** Adding a flag service would mean a second resolution path, which is the thing this record exists to prevent. Trigger: a genuine need for percentage rollouts across a large tenant base, which does not exist before Phase 3.

**Related.** ADR-012, ADR-021, ADR-028, ADR-033; `PLT-15`, `WLB-02`, `WLB-06`; Part 24 §24.2.2; Part 31 §31.

---

## 38.4 Decisions deliberately not recorded here

Three classes of decision appear across the specification and are intentionally absent from this part, so that their absence is not read as an oversight.

**Canon rules are not ADRs.** Canon §0.11's seven non-negotiable engineering rules — immutability, tenant scoping, `Decimal`, atomic transactions with audit rows, idempotency keys, the six-surface definition of a shipped feature, and the `Ub*` wrapper rule — are constraints the ADRs operate under. Where a rule needed a reasoned record because it embodies a genuine trade-off, one exists (ADR-029, ADR-032, ADR-010). The rest are rules, not choices.

**Product decisions are in Part 39.** Whether to build white-label into the MVP chassis, where the paid wall sits, which market comes first and what the non-goals are, are decisions with business rather than technical framing and belong to the product decision log.

**Feature-level design is in Part 17.** How the correction dialog behaves, what the reminder cadence defaults to, which columns the sales register shows — these are specified at implementation depth in the FRDs and are not architecture.

## 38.5 Amending this part

A new decision gets the next free number and the eight-section format. An existing decision is never edited in place once it has been implemented against: it is marked `Superseded by ADR-nnn` with a date, and the new record states in its Context what changed. ADR-021's allow-list is the one record designed to be amended rather than superseded, and every amendment gets its own record or sub-record (ADR-021a, ADR-024, ADR-037 to date).

Any ADR change that contradicts canon §0.4 must amend canon §0.4 in the same change, or canon wins and the ADR is a defect.

---

**End of Part 38.**
