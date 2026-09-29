# YourKhata as one platform: vision and binding rules

Status: **ACCEPTED 29 Sep 2026** (owner direction, CR-2026-09-29-PLATFORM-A). This is the single source of truth for the platform expansion. When another document disagrees with this one, this one wins until it is changed through a CR.

## 1. What we are building

YourKhata grows from a shop khata into **one application where different kinds of businesses and organisations keep their day-to-day records, money, documents and collections**. It is one product with separate modules, not a bundle of unrelated apps.

Each tenant (a business or organisation) turns on the modules it needs. Every module shares the same core:

- the same sign-in, team and roles;
- the same people and contacts;
- the same money records;
- the same documents, reminders and reports.

## 2. Module map

| Group | Module (code) | Status |
|---|---|---|
| **Core** (every tenant) | platform, team, parties (people & contacts), ledger (money in/out, balances), payments, notifications/reminders, reports, files, import_export, help | **Live** |
| **Shop & billing** | sales (GST invoices, estimates, credit notes), purchases, inventory (items & stock), expenses (and cashbook) | **Live** |
| **Lending & collections** | lending: lenders, borrowers, principal, interest, collection schedules, collection history, dues, reminders | **Planned**: research, then document |
| **Library** | library: catalogue, copies, members, issue and return, fines | **Planned** |
| **Gym & fitness** | gym: members, plans, memberships, renewals, attendance | **Planned** |
| **Hotel & stays** | hospitality: rooms, bookings, check-in/out, guest folio, billing | **Planned** |
| **Candidates** | For example coaching/tuition fees and rent collection. They come in only if Phase 2 research shows they reuse the shared engines. | Under research |

A module's status changes only through a CR. It moves from planned to in development to live.

## 3. Architecture rules (binding on every agent)

1. **One module is one Django app plus one frontend feature folder.** It has a `ModuleCode` entry, a place in `tenant.enabled_modules`, and a `MODULE_DEPENDENCIES` line. These three already exist in `apps/common/constants.py` and `apps/platform_app/services/tenant_settings.py`. The permission check is `_ModuleEnabled`, and that mechanism is reused, not replaced.
2. **Verticals never import each other.** A vertical may call core services, and only through their public service functions or seams, following the pattern of `purchases.services.payment_seam`. Core never imports a vertical.
3. **Build shared engines once and let the verticals configure them.** The Phase 2 research must confirm these candidates:
   - **Recurring dues and schedules:** instalments, memberships, fees, rent, and lender collection plans.
   - **Bookings and resources:** hotel rooms, and possibly gym slots and library holds.
   - **Check-ins and attendance:** gym members, and possibly coaching students.
   - **Money** always goes through the ledger and payments. No module keeps its own balance arithmetic.
   - **People** are always `parties`, with a role or type per module. No module keeps a second contacts table.
   - **Documents** always use the existing print and share pipeline.
4. **No new dependencies or external services** without an ADR (ADR-021). If a feature seems to need one, it goes to `docs/BACKLOG.md` with the reason.
5. **One architecture owner.** The architecture agent decides and records decisions as ADRs in Part 38. Other agents propose; they don't decide. Two agents never write the same file in the same phase.

## 4. Product rules

- **Honest landing page.** Only live modules get demos, screenshots and "Start free". Planned modules are shown as planned, with no dates, no invented features and no fake screenshots. Module status comes from one config file, so a module switches to live in one line.
- **In-app UI rule** (owner rule, unchanged): the app never shows an unbuilt feature or a "Soon" label. A planned module is simply absent from the app until it's built.
- **Terminology.** Plain product words: shop, store, business, organisation, member, customer, supplier, borrower, lender, guest, room.
  - **No regional or specialised jargon** in documentation, planning or new copy. This includes "kirana", which is removed from the landing page and from new documentation.
  - Hindi copy uses ordinary Hindi words.
- **Customer-facing documents never name the product** (existing rule). Receipts, statements, booking confirmations and membership cards carry the tenant's name only.
- **Lending is record-keeping, not lending.** YourKhata records what a lender and borrower agreed and what was collected. It doesn't lend, move money or score credit. The research phase must cover the legal context (for example state money-lending laws and fair-collection practice) and say what the product must and must not do.

## 5. Phase order (owner instruction, strict)

1. Analyse the existing application.
2. Update the landing page to the platform vision.
3. Research the modules.
4. Document the modules.
5. Review the architecture and identify what can be reused.
6. Implement.
7. QA with several agents.
8. Fix issues and run integration tests.
9. Sync with the owner's Mac.
10. Hand off.

No module code is written before steps 2–4 are done. **The gate at the end of every phase:**

- the work is committed;
- the docs are updated;
- the owner's Mac is fast-forwarded and verified;
- HANDOFF.md and `docs/platform/STATUS.md` are updated in the repo and in the Project;
- a handoff is given to the owner.

## 6. Where each source of truth lives

| Topic | Document |
|---|---|
| Vision, module map, rules | `docs/platform/00-platform-vision.md` (this file) |
| Progress and phase gates | `docs/platform/STATUS.md` and `HANDOFF.md` |
| Module research | `docs/platform/research/<module>.md` |
| Module requirements (FRD) | `docs/platform/frd/<module>.md` (the 14-section template in §7) |
| Architecture and ADRs | `docs/platform/10-architecture.md`; ADRs in `docs/38-architecture-decision-records.md` |
| Database | `docs/21-database-architecture.md`, plus each FRD's database section |
| API contracts | `docs/22-api-specification.md`, plus each FRD's API section |
| UI conventions | `docs/DESIGN-SYSTEM.md` |
| Development rules | `CLAUDE.md` |
| Testing strategy | `docs/28-testing-strategy.md`, plus each FRD's testing section |
| Change requests | Part 43, in the Claude Project (never overwritten from a local copy), and `docs/CR-LOG.md` |

## 7. FRD template for each module

Every FRD covers these 14 sections:

1. Product requirements
2. User flows
3. Feature list (minimum useful set, then later)
4. Entities and relationships
5. Database requirements
6. API requirements
7. Frontend requirements
8. UI/UX requirements
9. Validation and business rules
10. Permissions
11. Reports
12. Testing requirements
13. Edge cases
14. Future enhancements
