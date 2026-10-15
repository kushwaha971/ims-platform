# Shop/IMS readiness programme

Status: implementation specification, 15 October 2026. Owner request: entire Shop/IMS, all relevant business viewpoints, design and functionality above 8.5/10, editable default messages everywhere, and no avoidable duplicate code across the codebase. Target: **at least 9/10 independently in design/UX and functionality/business logic**. These are acceptance targets, not achieved ratings or a guarantee of commercial success.

## Documents

| Document | Main reader | Purpose |
|---|---|---|
| [Product and business requirements](01-product-and-business-requirements.md) | Product owner, business reviewer | Business models, roles, daily jobs and module scope |
| [Design and dashboard specification](02-design-and-dashboard-specification.md) | Designer, frontend engineer | Data hierarchy, Shop dashboard, lists, editors, drawers and responsive rules |
| [Business rules and data integrity](03-business-rules-and-data-integrity.md) | Domain reviewer, backend engineer | Money, stock, returns, reconciliation and unresolved decisions |
| [Engineering and code reuse](04-engineering-and-code-reuse.md) | Engineering lead, reviewers | Single ownership, whole-codebase duplication audit and reliability |
| [Editable messages and reminders](05-editable-messages-and-reminders.md) | Product, frontend, backend, QA | Universal editable composer, channels, bulk/scheduled messages and consent |
| [QA and release scorecard](06-qa-and-release-scorecard.md) | QA, product, design | Evidence, score calculation, scenarios and release gates |
| [Delivery roadmap](07-delivery-roadmap.md) | Entire team | Ordered work packages, dependencies and decision register |
| [Acceptance tracker](08-acceptance-and-evidence-tracker.md) | Delivery team and reviewers | Requirement statuses, score/sign-off record and evidence templates |

## Scope and boundaries

Entire Shop/IMS: dashboard; customer and supplier onboarding/accounts; billing/POS; estimates; sales orders; delivery challans; customer returns/credit notes; purchases and purchase orders; supplier returns/debit notes; items, units, prices, stock and adjustments; payments/advances/refunds; expenses/cashbook; dues/messages; reports/documents/exports; role controls; recovery, accessibility and operability.

Customers and Suppliers remain separate sections and role-specific transaction choices. Udhaar remains a separate app/book; no combined Shop/Udhaar totals. Shared identity for an explicitly dual-role person does not authorize merged navigation or cross-book settlement. Personal user-owned Udhaar and default login landing require their own ownership/migration specification; this programme must not silently move existing business entries.

Shared message editing and code-reuse requirements extend to Shop, Library, Lending and Udhaar. Industry-specific features are capability-gated; this programme does not claim that a basic inventory system already meets every regulated or specialized industry's needs. Business settings needed for correct operation are tested; unrelated Settings/Profile visual redesign is not part of this scope.

## Existing evidence and status

Source: [Shop audit](../review/06-shop-user-audit.md), [QA handoff](../../QA.md), and [existing decisions](../DECISIONS.md). Last recorded baseline: 1,542 Shop backend tests, 4,096 frontend tests, build/types/locale/contrast/bundle checks passed. This baseline precedes the future work here and is not evidence that these requirements are implemented.

Known open work: mixed-cost return valuation SH-009; desktop billing density SH-010; draft recovery SH-011; mobile price visibility SH-012; supplier-return proof SH-013; terminology/paging SH-014. Local audit fixes require release verification; a journal entry saying “fixed locally” is not proof of deployment.

## Agent entry point

Use the [portable coding-agent prompt](AGENT_START_PROMPT.md) with this repository checked out. It supplies the same scope, boundaries and evidence standards to different coding tools without assuming identical tool capabilities.

## How to proceed

1. Resolve the business-rule decisions in the roadmap, particularly valuation and dual-role settlement.
2. Review screen designs against real tasks and actual data contracts.
3. Implement small vertical slices with shared owners, then test real mobile/desktop journeys.
4. Attach evidence to requirement IDs and score the enabled release scope using the scorecard.
5. Obtain product, domain, engineering and QA sign-off before a release claim.

Hard gates: no unresolved critical/high correctness or privacy defect in enabled scope; no missing editable outgoing-message path; no unreviewed high-risk duplicated business logic; both independent scores at least 9/10. A good average cannot compensate for wrong money, data leakage or unusable billing.
