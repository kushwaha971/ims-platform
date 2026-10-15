# Engineering and whole-codebase reuse standard

Owner requirement: avoid duplicate code throughout the codebase. This workstream includes frontend, backend and shared infrastructure across Shop, Udhaar, Library and Lending. It is an implementation/refactoring programme, not a claim that current duplication has been eliminated.

## Single-owner requirements

ENG-01: each business rule has one authoritative backend owner. Views parse/authorize, services perform transactions, selectors project facts. Do not independently recalculate balances, stock effects or return allocation in endpoints, serializers, screens and reports.

ENG-02: each interaction pattern has one shared frontend implementation where behavior is equivalent: compact cards/facts, overlays, searchable controls, action menus, confirmation, phone contact prefill, editable message composer, pagination/retry and formatting. Module code composes these with domain-specific labels/data/permissions.

ENG-03: share stable primitives and protocols; preserve different domain semantics. Lending payoff, Library seat release and Shop stock return are not interchangeable financial rules. A large generic component with many module switches is not a successful deduplication.

ENG-04: follow existing architecture: design-system/ml-uikit wrappers, Redux Toolkit/thunks, React Hook Form and central validation/service boundaries. No new dependency or infrastructure merely to remove a few repeated lines; follow the existing ADR process where genuinely needed.

## Reuse catalogue

| Concern | Shared owner | Module responsibility |
|---|---|---|
| Card/facts/spacing | Existing compact records and design-system components | Which facts, ordering, status and actions matter |
| Overlays/focus/scroll lock | Shared overlay primitives | Form values, validation and task lifecycle |
| Search/dropdowns | Shared searchable controls and scoped search hooks | Customer/supplier/item eligibility |
| Money/date/phone | Central utilities and authoritative server conventions | Context, currency, timezone and consent |
| Contact import | Existing phone-contact picker hook/normalization | Onboarding role and business/book-scoped duplicate handling |
| Messages/reminders | One composer contract and channel adapters | Template/context, supported actions, authorization and caps |
| Financial writes/retries | Backend idempotency protocol and stable client logical keys | Posting transaction and lifecycle rules |
| Async lists/reports | Reusable request-identity/paging patterns | Filter identity, source, sort and scope |
| Reports/exports | Shared authoritative selectors | Projection columns, period and read/export permissions |

Start by reviewing existing `src/components/records`, `src/design-system`, `src/hooks/usePhoneContactPicker.ts`, central money/phone utilities and common backend idempotency services. Confirm exact ownership before extracting another helper.

## Whole-codebase duplicate audit

REUSE-01: inventory repeated components, services, selectors, validation, filters, phone/message builders, balance arithmetic and request recovery. Search and review semantic duplication as well as copied text. Record baseline, locations, risk, proposed owner and affected callers.

REUSE-02: prioritize duplicated money/stock/permission rules, then duplicated message/contact/retry behavior, then repeated UI composition. Extract behind a stable public interface; migrate every equivalent caller and delete the obsolete implementation.

REUSE-03: maintain an exception register for intentional repetition: independent test oracles, client preview versus authoritative server validation, locale resources and genuinely different domain rules. Each exception needs a reason, owner and review trigger. Do not weaken server validation to make client/server code look identical.

REUSE-04: zero unreviewed duplicated high-risk business rules; zero new avoidable duplication in changed scope. Every new shared pattern has discoverable usage/examples and a clear owner. Track remaining duplication debt explicitly; do not declare an unmeasured “0% duplication” score.

REUSE-05: a refactor must preserve old public behavior unless a separate requirement changes it. Test all affected modules and permissions, bundle costs, import boundaries, focus/scroll behavior and API compatibility. Keep extraction and behavior changes reviewable.

## Reliability and performance

ENG-05: stabilize logical mutation identities before the first request; retain them on uncertain failures and across recovery where required. Changed-body retries, remounts, concurrent tabs, stale versions and interrupted posting have deliberate outcomes. Draft identity recovery is a separate requirement from issued-document idempotency.

ENG-06: only current request identities may update lists, totals, summaries or errors. Include business/user reset, filter, sort and page changes. Clear sensitive previous-context state immediately; server tenancy is still required.

ENG-07: API pagination metadata is preserved; append/dedupe and retry cannot silently lose records or invent end-of-list. Large exports use the documented platform workflow with progress/failure rather than freezing the UI.

ENG-08: lazy-load substantial drawers/forms and optional exports; verify actual built bundles. A new route reusing an existing report needs an explicit comparable budget, not a silently disabled gate. Budget changes explain measured cost and purpose; global limits do not rise automatically.

Before performance acceptance, freeze representative hardware/network and volumes. Proposed initial workload: 5,000 items, 5,000 counterparties, 100,000 ledger entries and 1/10/50/100-line documents. Confirm supported limits and benchmark budgets against existing canon before promising them commercially. Measure p50/p95 read/post/search latency, query counts, cold route bytes and memory; separate development compilation from production performance.

## Review gates

A PR identifies requirement IDs, shared owners reused, obsolete copies removed, API changes, regression evidence and measured risks. Reviewers must answer: could another module already own this; are domain differences preserved; can retry or tenancy break it; does the built screen work on mobile and desktop? Unit tests, real browser checks and independent reconciliation serve different purposes.
