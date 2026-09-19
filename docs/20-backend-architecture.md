# Part 20 — Backend Architecture

> **Status:** normative. This chapter is the build instruction for the DigiKhaato backend. Where it appears to conflict with Part 0 (Canon), Part 0 wins and this chapter is a defect. Where it appears to conflict with Part 21 (Database) or Part 22 (API), raise a change request — those three chapters are meant to be one design described from three angles.
>
> **Audience:** the AI coding agent (or human) writing the backend from an empty repository. Nothing in this chapter may be left to invention: if a decision is not written here, in Part 21, or in Part 22, it is a specification gap and must be raised as a CR, not guessed.

## 20.0 The constraints this architecture must satisfy

Every decision below is downstream of ADR-001 … ADR-021 in canon §0.4. Restated as hard limits so they are never re-litigated mid-build:

| Constraint | Consequence for this chapter |
|---|---|
| Django 5.2 LTS + DRF, Python 3.12 | No async views, no FastAPI, no Django Ninja. DRF `ViewSet`/`APIView` only. |
| Modular monolith, one app per module | One Django project, thirteen apps, one deployable. No service boundaries, no HTTP between apps. |
| PostgreSQL 16 in Docker, dev **and** prod | No SQLite anywhere, including tests. Postgres-only features (`jsonb`, partial indexes, `FOR UPDATE SKIP LOCKED`, `pg_trgm`) are allowed and used. |
| UUID v7 primary keys | `uuid6.uuid7()` generated in Python (Postgres 16 has no `uuidv7()`). Time-ordered so B-tree inserts stay at the right edge. |
| `Decimal` money, string transport | No `float` in any code path, including report aggregation and tests. Serializers emit strings. |
| **No Celery, no Redis** | Background work is `platform_job` rows drained by `manage.py run_scheduler`, invoked by cron / a compose `scheduler` service. No broker, no result backend, no cache server. |
| **No S3/MinIO** | `MEDIA_ROOT` on local disk through Django's storage API. Object storage is a settings switch in Phase 2 and must not require call-site changes. |
| **No Sentry / OpenTelemetry / Prometheus at MVP** | Observability is stdlib `logging` in JSON plus SQL against existing tables (Part 30). |
| PDFs rendered client-side | The backend never imports WeasyPrint, ReportLab or wkhtmltopdf. `pdf_url` endpoints serve the *print view contract*, not a rendered file, at MVP. |
| Messaging adapter-only | `ConsoleSmsBackend` writes to the log; WhatsApp is a `wa.me` URL builder. No provider SDKs. |
| UPI QR generated locally | A small pure-Python QR encoder or a vendored generator; no aggregator, no network call. |
| REST under `/api/v1/` | One URL prefix, one router tree, one envelope. |
| docker-compose: `db`, `backend`, `scheduler`, `frontend` | Four services; the scheduler is the same image with a different command. |
| Minimal dependencies | The ADR-021 backend allow-list is closed: Django, djangorestframework, djangorestframework-simplejwt, psycopg[binary], django-filter, django-cors-headers, Pillow, python-decouple/environs, pytest, pytest-django, black, isort, flake8, factory-boy. Plus `uuid6` (required by ADR-009 — see §20.13.4). Anything else is a new ADR. |

---

## 20.1 Architectural overview

### 20.1.1 The shape in one paragraph

DigiKhaato's backend is a **modular monolith**: one Django project (`config`), one database, one process image, and thirteen Django applications that map one-to-one onto the product modules in canon §0.3. Every application owns its tables, its serializers, its services and its URLs. Applications talk to each other by **importing service functions and selector functions**, never by importing each other's views, serializers or querysets, and never over the network. The monolith is deliberate: the product is a single-tenant-per-row SaaS whose hardest problems (transactional consistency between ledger, stock and documents) are exactly the problems that distributed services make worse. The modularity is equally deliberate: the app boundaries are the seams along which a module could later become a separate deployable if a partner ever demands it, and the dependency rules in §20.1.4 are what keep those seams clean.

### 20.1.2 The applications

| App (Django label) | Module code | Owns | MVP scope |
|---|---|---|---|
| `common` | — | Abstract base models, tenancy primitives, the response envelope, the exception hierarchy, pagination, idempotency, money helpers, the job registry, the audit writer, DRF base classes. **Owns no business tables** except `platform`-adjacent infrastructure it is explicitly assigned (none at MVP). | ✅ |
| `platform` | `platform` | `platform_partner`, `platform_plan`, `platform_tenant`, `platform_user`, `platform_membership`, `platform_role`, `platform_invitation`, `platform_otp_challenge`, `platform_session`, `platform_tenant_setting`, `platform_document_sequence`, `platform_audit_log`, `platform_job`, `platform_idempotency_key` | ✅ |
| `parties` | `parties` | `parties_party`, `parties_tag`, `parties_party_tag`, `parties_share_link` (P2) | ✅ |
| `ledger` | `ledger` | `ledger_entry`, `ledger_reminder` | ✅ |
| `inventory` | `inventory` | `inventory_category`, `inventory_unit`, `inventory_location`, `inventory_item`, `inventory_item_stock`, `inventory_stock_movement`, `inventory_stock_adjustment`, plus P2/P3 variant, transfer, price-list and batch tables | ✅ |
| `tax` | — (cross-cutting) | `tax_rate`, `tax_hsn` | ✅ |
| `sales` | `sales` | `sales_document`, `sales_document_line`, `sales_credit_application` | ✅ |
| `purchases` | `purchases` | `purchases_document`, `purchases_document_line` | ✅ |
| `payments` | `payments` | `payments_payment`, `payments_allocation`, `payments_request` (P2), `payments_vpa_mapping` (P2) | ✅ |
| `expenses` | `expenses` | `expenses_category`, `expenses_expense` | ✅ |
| `reports` | `reports` | `reports_snapshot`, `reports_export`. **Owns no transactional tables** — it reads other apps' selectors. | ✅ |
| `notifications` | `notifications` | `notifications_notification`, `notifications_message_log`, `notifications_template` | ✅ |
| `imports` | `import_export` | `imports_job` | ✅ |
| `files` | — (cross-cutting) | `files_attachment` | ✅ |
| `help` | `help` | `help_article`, `help_feedback`, `help_search_log` | Phase 2 — the app exists with an empty `models.py` at MVP so the label is reserved. |

The Django app label is the first element of every table name (canon §0.10: tables are `<app>_<snake>`), so the app list and the table prefix list in Part 21 are the same list. `platform` is a Python keyword-adjacent name but a legal Django label; the package lives at `apps/platform_app/` on disk with `label = "platform"` declared in its `AppConfig` to avoid shadowing the stdlib `platform` module. **This is the only place where the on-disk package name differs from the app label, and it must be done exactly this way.**

```python
# apps/platform_app/apps.py
from django.apps import AppConfig


class PlatformConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"  # unused; every model sets an explicit UUID pk
    name = "apps.platform_app"
    label = "platform"          # ← table prefix and app_label in migrations
    verbose_name = "Platform"

    def ready(self) -> None:
        from apps.platform_app import signals  # noqa: F401  (registers receivers)
```

### 20.1.3 Layer map

```
                      HTTP  (DRF router under /api/v1/)
                        │
        ┌───────────────▼────────────────┐
        │  views/      (thin)            │  auth, permissions, throttles, parse, delegate, envelope
        └───────────────┬────────────────┘
                        │
        ┌───────────────▼────────────────┐
        │  serializers/                  │  shape in / shape out; field validation; Decimal→str
        └───────────────┬────────────────┘
                        │ validated_data (plain dict of Python types)
        ┌───────────────▼────────────────┐
        │  services/     ★ business      │  transactions, invariants, locks, audit, job enqueue
        └───────┬───────────────┬────────┘
                │               │
    ┌───────────▼─────┐   ┌─────▼─────────────┐
    │  selectors/     │   │  models           │  ORM only; no business logic in save()
    │  (reads)        │   │  managers/qs      │
    └───────────┬─────┘   └─────┬─────────────┘
                └──────┬────────┘
                       ▼
                   PostgreSQL 16
```

`integrations/` (SMS, WhatsApp, UPI) hangs off `services/` only. `tasks.py` in each app registers job handlers that call the same `services/` functions the views call — a background job is never a second implementation of a business rule.

### 20.1.4 Dependency rules between applications

These rules are enforced by review and by an import-linter-style test (§20.1.5). They are not advisory.

**Rule D1 — `common` depends on nothing.** `apps/common/**` may import Django, DRF and the standard library. It may **not** import any other `apps.*` package at module level. Where it needs a concrete model (for example the audit writer needs `AuditLog`), it imports lazily inside the function via `django.apps.apps.get_model("platform", "AuditLog")`.

**Rule D2 — every app may depend on `common`.** Unconditionally, at module level.

**Rule D3 — every business app may depend on `platform` and `tax`.** `platform` owns tenancy, users, settings, sequences, audit and jobs; `tax` owns rate lookup. These are the two "downhill" apps. Neither may import a business app at module level.

**Rule D4 — the domain dependency graph is a DAG, in this order:**

```
common  →  platform  →  tax  →  files  →  parties  →  ledger  →  inventory
        →  sales  →  purchases  →  payments  →  expenses
        →  notifications  →  imports  →  reports
```

An app may import **only from apps to its left**, with these named exceptions:

| Importer | May import | Why |
|---|---|---|
| `ledger` | `parties` (services + selectors) | Posting an entry updates the party balance cache. |
| `sales`, `purchases` | `parties`, `ledger`, `inventory`, `tax`, `files` | Issuing a document posts ledger and stock. |
| `payments` | `parties`, `ledger`, `sales`, `purchases` | Allocation touches documents; posting touches ledger. |
| `expenses` | `parties`, `ledger`, `files` | An unpaid expense posts a payable ledger entry. |
| `notifications` | `parties`, `platform` | Resolving a recipient and a template. |
| `imports` | `parties`, `inventory`, `ledger` | Import commits call those apps' services. |
| `reports` | everything (selectors only) | Reports are read-only projections. **`reports` may import any app's `selectors/` and models, and may import no app's `services/`.** |

**Rule D5 — `sales` must not import `payments` at module level.** A sale that records an immediate payment needs `payments.services.record_payment`, and `payments` imports `sales` for allocation. This is the one genuine cycle in the product. It is broken by **deferred import inside the function body**, documented with the reason:

```python
# apps/sales/services/issue.py
def issue_invoice(...):
    ...
    if payment_input:
        # Deferred import: payments imports sales for allocation (rule D5).
        from apps.payments.services.record import record_payment

        record_payment(...)
```

No other cycle is permitted. If a second cycle appears, the design is wrong and a CR is raised.

**Rule D6 — domain services never import views, serializers, DRF, or `rest_framework.*`.** A service function takes Python values and returns Python values or model instances. It raises `DomainError` subclasses (§20.3.5), never `rest_framework.exceptions.*`. This is what makes services callable from a management command, a job handler and an import row with no HTTP request in sight.

**Rule D7 — views never import models of another app.** A view in `sales` that needs a party fetches it through `parties.selectors.get_party_for_tenant(...)`, not `Party.objects`.

**Rule D8 — selectors never write.** A function in `selectors/` may not call `.save()`, `.create()`, `.update()`, `.delete()`, or open a transaction.

**Rule D9 — `signals.py` may only do things that are safe to lose.** Cache invalidation, `transaction.on_commit` notification enqueues. Never balance maths, never ledger writes. The reason: signals are invisible at the call site and untestable in isolation; a balance that depends on a signal is a balance that silently breaks when a service uses `bulk_create`.

### 20.1.5 The architecture test

The rules above are asserted in `tests/architecture/test_import_rules.py`, which walks the AST of every module under `apps/` and checks module-level imports against a declared matrix. It runs in CI on every PR.

```python
# tests/architecture/test_import_rules.py
import ast
import pathlib

import pytest

APPS_ROOT = pathlib.Path(__file__).resolve().parents[2] / "apps"

# app -> apps it may import at module level (transitively expanded by the test)
ALLOWED: dict[str, set[str]] = {
    "common": set(),
    "platform_app": {"common"},
    "tax": {"common", "platform_app"},
    "files": {"common", "platform_app"},
    "parties": {"common", "platform_app", "files"},
    "ledger": {"common", "platform_app", "parties", "files"},
    "inventory": {"common", "platform_app", "tax", "files"},
    "sales": {"common", "platform_app", "tax", "files", "parties", "ledger", "inventory"},
    "purchases": {"common", "platform_app", "tax", "files", "parties", "ledger", "inventory"},
    "payments": {"common", "platform_app", "parties", "ledger", "sales", "purchases"},
    "expenses": {"common", "platform_app", "tax", "parties", "ledger", "files"},
    "notifications": {"common", "platform_app", "parties"},
    "imports": {"common", "platform_app", "files", "parties", "inventory", "ledger"},
    "reports": set(ALLOWED_ALL := {
        "common", "platform_app", "tax", "files", "parties", "ledger", "inventory",
        "sales", "purchases", "payments", "expenses", "notifications", "imports",
    }),
}

FORBIDDEN_IN_SERVICES = ("rest_framework", "django.http", "apps.%s.views", "apps.%s.serializers")


def _module_level_imports(path: pathlib.Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: set[str] = set()
    for node in tree.body:  # top level only — deferred imports live inside functions
        if isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            found.add(node.module)
    return found


@pytest.mark.parametrize("app", sorted(ALLOWED))
def test_app_only_imports_allowed_apps(app: str) -> None:
    allowed = ALLOWED[app] | {app}
    for path in (APPS_ROOT / app).rglob("*.py"):
        if "migrations" in path.parts or "tests" in path.parts:
            continue
        for mod in _module_level_imports(path):
            if not mod.startswith("apps."):
                continue
            target = mod.split(".")[1]
            assert target in allowed, f"{path.relative_to(APPS_ROOT)} imports apps.{target} (not allowed)"


def test_services_never_import_http_layer() -> None:
    for path in APPS_ROOT.rglob("services/**/*.py"):
        text = path.read_text(encoding="utf-8")
        assert "rest_framework" not in text, f"{path} imports DRF — services are HTTP-free (rule D6)"


def test_selectors_never_write() -> None:
    banned = (".save(", ".create(", ".update(", ".delete(", "transaction.atomic")
    for path in APPS_ROOT.rglob("selectors/**/*.py"):
        text = path.read_text(encoding="utf-8")
        for token in banned:
            assert token not in text, f"{path} contains {token!r} — selectors are read-only (rule D8)"
```

`reports` is allowed to import everything, but `test_services_never_import_http_layer` plus a dedicated assertion that no file under `apps/reports/` imports a string matching `apps.*.services` keeps it read-only.

### 20.1.6 What is deliberately *not* in this architecture

- **No repository pattern over the ORM.** Django's queryset *is* the repository. A hand-rolled repository layer buys nothing here and costs a day of indirection per model.
- **No DDD aggregates / value objects.** The invariants that matter (append-only ledger, signed stock, gap-free numbering) are enforced by database constraints plus service functions with locks, which is stronger than an in-memory aggregate root.
- **No CQRS infrastructure.** The `services/` vs `selectors/` split *is* the command/query separation, in one process against one database.
- **No event bus.** `platform_job` is the only asynchronous mechanism. Django signals are limited by rule D9.
- **No GraphQL, no gRPC.** REST under `/api/v1/` per ADR-017.
- **No multi-database routing.** One database; read replicas are a Phase 3 concern and would be introduced as a Django database router with `selectors/` as the only routing seam — which is another reason reads are isolated in `selectors/`.

---

## 20.2 The repository tree

### 20.2.1 Top level

```
udhaarbook-backend/
├── manage.py
├── pyproject.toml                  # black, isort, ruff, pytest, mypy config (§26.14)
├── requirements/
│   ├── base.txt                    # ADR-021 allow-list, pinned == versions
│   ├── dev.txt                     # -r base.txt + pytest, factory-boy, django-debug-toolbar
│   └── prod.txt                    # -r base.txt + gunicorn
├── .env.example                    # every variable in §20.13.2 with a safe default
├── Dockerfile
├── docker-compose.yml              # db, backend, scheduler, frontend
├── docker/
│   ├── entrypoint.sh               # wait-for-db, migrate, collectstatic, exec "$@"
│   └── crontab                     # the scheduler service's cron lines (§20.8.6)
├── config/
│   ├── __init__.py
│   ├── settings/
│   │   ├── __init__.py
│   │   ├── base.py                 # everything shared; reads env via environs
│   │   ├── dev.py                  # DEBUG, console SMS, debug-toolbar, permissive CORS
│   │   ├── prod.py                 # DEBUG=False, secure cookies, file log handler
│   │   └── test.py                 # fast hashers, eager jobs, temp MEDIA_ROOT
│   ├── urls.py                     # /api/v1/ include tree + /system/* + /public/*
│   ├── asgi.py
│   └── wsgi.py
├── apps/
│   ├── common/
│   ├── platform_app/               # label = "platform"
│   ├── tax/
│   ├── files/
│   ├── parties/
│   ├── ledger/
│   ├── inventory/
│   ├── sales/
│   ├── purchases/
│   ├── payments/
│   ├── expenses/
│   ├── notifications/
│   ├── imports/
│   ├── reports/
│   └── help/                       # Phase 2 placeholder: apps.py + empty models.py
├── tests/
│   ├── architecture/               # §20.1.5 import rules
│   ├── factories/                  # factory-boy factories, one module per app
│   ├── integration/                # cross-app flows (issue invoice → ledger → stock → payment)
│   └── conftest.py                 # tenant/user/api-client fixtures
├── locale/
│   ├── en/LC_MESSAGES/django.po
│   └── hi/LC_MESSAGES/django.po
└── media/                          # MEDIA_ROOT in dev; bind-mounted in compose (gitignored)
```

### 20.2.2 `apps/common/` — the shared kernel

```
apps/common/
├── __init__.py
├── apps.py
├── constants.py                    # ModuleCode, RoleCode, Direction, EntryType, MovementType,
│                                   # DocumentKind, PaymentMode, JobStatus, ActorType, ErrorCode
├── db/
│   ├── __init__.py
│   ├── fields.py                   # MoneyField, QuantityField, UnitCostField, RateField, UuidV7PrimaryKey
│   ├── functions.py                # Postgres wrappers used in selectors (e.g. TrigramSimilarity)
│   └── constraints.py              # helpers to declare the recurring CHECK/partial-unique patterns
├── models.py                       # TimeStampedModel, TenantModel, SoftDeleteModel, ImmutableModel
├── managers.py                     # TenantQuerySet, TenantManager, SoftDeleteManager
├── tenancy.py                      # get_effective_tenant(), TenantContext, current_tenant()
├── middleware.py                   # RequestIdMiddleware, TenantContextMiddleware, AccessLogMiddleware
├── authentication.py               # CookieOrBearerJWTAuthentication
├── permissions.py                  # HasPermission, ModuleEnabled, PlanLimit, IsSuperAdmin
├── permissions_registry.py         # the codename registry + role→codename map (canon §0.9)
├── viewsets.py                     # TenantScopedViewSet, TenantScopeMixin, ReadWriteSerializerMixin
├── pagination.py                   # PagePagination, CursorPagination (canon §22.1)
├── filters.py                      # BaseTenantFilterSet, DateRangeFilter, MultiEnumFilter
├── renderers.py                    # EnvelopeJSONRenderer
├── exceptions.py                   # DomainError hierarchy + drf_exception_handler
├── responses.py                    # StandardResponse (ok / created / no_content / paginated)
├── audit.py                        # write_audit(), AuditAction constants, diff_fields()
├── idempotency.py                  # IdempotencyKey model proxy + claim/replay helpers
├── money.py                        # D(), q2(), q3(), q4(), half_up(), allocate_proportional()
├── dates.py                        # tenant_today(), fy_label_for(), fy_bounds()
├── jobs.py                         # enqueue(), job_handler registry, JobContext
├── logging.py                      # JsonFormatter, request-id filter, sql comment hook
├── storage.py                      # tenant_media_path(), validate_upload(), compress_image()
├── integrations/
│   ├── __init__.py
│   ├── sms/
│   │   ├── base.py                 # SmsBackend protocol
│   │   └── console.py              # ConsoleSmsBackend (MVP)
│   ├── whatsapp/
│   │   ├── base.py                 # WhatsAppBackend protocol
│   │   └── deep_link.py            # WaMeBackend (MVP)
│   └── upi/
│       ├── intent.py               # build_upi_url()
│       └── qr.py                   # svg_qr() — local encoder, no network
├── management/
│   └── commands/
│       ├── run_scheduler.py        # the job runner (§20.8)
│       ├── seed_reference_data.py  # tax rates, units, system roles, expense categories, HSN
│       ├── seed_demo_tenant.py     # a full demo tenant for local dev
│       ├── recalc_balances.py
│       ├── recalc_stock.py
│       └── check_invariants.py     # read-only consistency report (§20.11.5)
├── migrations/
└── tests/
    ├── test_money.py
    ├── test_tenancy.py
    ├── test_idempotency.py
    └── test_jobs.py
```

### 20.2.3 `apps/parties/` — the simple app, to file level

`parties` is the template every simple CRUD app copies. A single model package is unnecessary here, so `models.py` is one file.

```
apps/parties/
├── __init__.py
├── apps.py                         # PartiesConfig(name="apps.parties", label="parties")
├── constants.py                    # PartyStatus, GstRegistration, BalanceFilter
├── models.py                       # Party, Tag, PartyTag, ShareLink (P2, defined now, unrouted)
├── managers.py                     # PartyQuerySet (.with_balance_filter(), .search())
├── serializers/
│   ├── __init__.py                 # re-exports the public names
│   ├── party.py                    # PartyReadSerializer, PartyListSerializer,
│   │                               # PartyCreateSerializer, PartyUpdateSerializer
│   ├── tag.py                      # TagSerializer
│   └── nested.py                   # PartyMiniSerializer (id, name, mobile) used by other apps
├── services/
│   ├── __init__.py
│   ├── crud.py                     # create_party(), update_party(), archive_party(), restore_party()
│   ├── balance.py                  # apply_balance_delta(), recompute_party_balance()
│   └── share_link.py               # issue_share_link(), revoke_share_link()  (P2)
├── selectors/
│   ├── __init__.py
│   ├── party.py                    # list_parties(), get_party(), party_summary(), party_totals()
│   └── tag.py                      # list_tags()
├── permissions.py                  # PartyPermissions = HasPermission map per action
├── filters.py                      # PartyFilterSet (q, type, balance, status, tag, collection)
├── views/
│   ├── __init__.py
│   ├── party.py                    # PartyViewSet
│   └── tag.py                      # TagViewSet
├── urls.py                         # router registrations for /parties, /tags
├── admin.py                        # read-mostly Django admin for support (super-admin only)
├── signals.py                      # none at MVP; file exists with a docstring saying so
├── tasks.py                        # job handlers: parties.recalc_balances_for_tenant
├── migrations/
│   ├── __init__.py
│   └── 0001_initial.py
└── tests/
    ├── __init__.py
    ├── test_models.py              # constraints: unique mobile per tenant, archive guard
    ├── test_services.py            # create/archive/restore, balance delta
    ├── test_selectors.py           # filters, totals over the filtered set, query counts
    ├── test_api.py                 # status codes, envelope, permissions, pagination
    └── test_tenancy.py             # cross-tenant 404 proof for every route
```

### 20.2.4 `apps/sales/` — the complex app, to file level

`sales` is the largest app: two document kinds at MVP (`invoice`, `bill_of_supply`) plus `estimate` and `credit_note`, a tax engine, a numbering interaction, stock and ledger side effects, public share links and print contracts. Its `models` and `services` are packages.

```
apps/sales/
├── __init__.py
├── apps.py
├── constants.py                    # SalesKind, InvoiceStatus, EstimateStatus, CreditNoteStatus,
│                                   # DiscountType, UTGST_STATE_CODES, PRINT_TEMPLATES
├── models/
│   ├── __init__.py                 # from .document import SalesDocument; from .line import ...
│   ├── document.py                 # SalesDocument (all kinds; `kind` discriminator)
│   ├── line.py                     # SalesDocumentLine
│   └── credit_application.py       # SalesCreditApplication (credit note → invoice)
├── managers.py                     # SalesDocumentQuerySet (.invoices(), .open(), .overdue(), .totals())
├── serializers/
│   ├── __init__.py
│   ├── document_read.py            # SalesDocumentSerializer (full §22.7 shape), SalesDocumentListSerializer
│   ├── document_write.py           # InvoiceCreateSerializer, InvoiceUpdateSerializer,
│   │                               # EstimateCreateSerializer, CreditNoteCreateSerializer
│   ├── line.py                     # SalesLineReadSerializer, SalesLineWriteSerializer
│   ├── actions.py                  # IssueSerializer, VoidSerializer, ConvertSerializer, ApplySerializer
│   └── public.py                   # PublicDocumentSerializer (redacted shape for share links)
├── services/
│   ├── __init__.py
│   ├── tax_engine.py               # compute_document_totals() — SAL-02 BR-1…BR-9, pure, no DB
│   ├── draft.py                    # create_draft(), update_draft(), delete_draft()
│   ├── issue.py                    # issue_invoice() — the orchestrator (SAL-02 BR-16)
│   ├── void.py                     # void_invoice()
│   ├── estimate.py                 # convert_estimate_to_invoice()
│   ├── credit_note.py              # issue_credit_note(), apply_credit_note()
│   ├── numbering.py                # allocate_number() wrapper over platform.services.sequence
│   ├── snapshot.py                 # build_party_snapshot(), build_supplier_snapshot()
│   └── rule46.py                   # check_rule46() → {passed, issues[]} for meta.rule46
├── selectors/
│   ├── __init__.py
│   ├── document.py                 # list_documents(), get_document(), document_totals()
│   ├── line.py                     # lines_for_document()
│   ├── register.py                 # sales_register_rows() — consumed by reports
│   └── public.py                   # get_document_by_public_token()
├── permissions.py
├── filters.py                      # SalesDocumentFilterSet
├── views/
│   ├── __init__.py
│   ├── invoice.py                  # InvoiceViewSet (+ issue/void/share-links/upi-intent actions)
│   ├── estimate.py                 # EstimateViewSet (+ convert)
│   ├── credit_note.py              # CreditNoteViewSet (+ issue/void/apply)
│   └── public.py                   # PublicDocumentView (unauthenticated, token-scoped)
├── urls.py
├── admin.py
├── signals.py                      # on_commit hook: low-stock check after issue (calls inventory service)
├── tasks.py                        # sales.refresh_overdue, sales.render_share_snapshot
├── migrations/
│   ├── __init__.py
│   ├── 0001_initial.py
│   └── 0002_add_version_to_document.py     # CR-SAL-3 (§20.12.4)
└── tests/
    ├── __init__.py
    ├── test_tax_engine.py          # the BR-10 worked example asserted paisa-exact
    ├── test_issue.py               # the twelve ordered side effects of BR-16
    ├── test_void.py
    ├── test_numbering.py           # concurrency: two issues, consecutive numbers, no gaps
    ├── test_credit_note.py
    ├── test_rule46.py
    ├── test_api_invoice.py
    ├── test_api_estimate.py
    ├── test_public_links.py
    ├── test_idempotency.py
    └── test_query_counts.py        # N+1 budget per endpoint (§20.14.3)
```

### 20.2.5 `config/urls.py`

```python
# config/urls.py
from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path

from apps.common.views import HealthView, ReadinessView, VersionView

api_v1 = [
    path("auth/", include("apps.platform_app.urls_auth")),
    path("", include("apps.platform_app.urls")),        # tenants, memberships, roles, audit-logs, jobs
    path("", include("apps.parties.urls")),             # parties, tags
    path("", include("apps.ledger.urls")),              # ledger-entries, reminders, ledger/*
    path("", include("apps.inventory.urls")),           # items, categories, units, stock/*
    path("", include("apps.tax.urls")),                 # taxes/rates, taxes/hsn
    path("sales/", include("apps.sales.urls")),
    path("purchases/", include("apps.purchases.urls")),
    path("", include("apps.payments.urls")),            # payments, payment-requests (P2)
    path("", include("apps.expenses.urls")),
    path("reports/", include("apps.reports.urls")),
    path("", include("apps.notifications.urls")),
    path("", include("apps.imports.urls")),
    path("", include("apps.files.urls")),               # attachments
]

urlpatterns = [
    path("api/v1/", include((api_v1, "v1"), namespace="v1")),
    path("api/v1/public/", include("apps.sales.urls_public")),   # token-scoped, unauthenticated
    path("api/v1/system/health", HealthView.as_view(), name="health"),
    path("api/v1/system/ready", ReadinessView.as_view(), name="ready"),
    path("api/v1/system/version", VersionView.as_view(), name="version"),
]

if settings.DEBUG:
    import debug_toolbar

    urlpatterns += [path("__debug__/", include(debug_toolbar.urls))]
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
```

In production `MEDIA_URL` is **not** served by Django: every media byte goes through `files.views.AttachmentDownloadView`, which performs the tenant check before streaming (§20.9.4). The `static()` line above exists only under `DEBUG`.

### 20.2.6 `docker-compose.yml`

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-udhaarbook}
      POSTGRES_USER: ${POSTGRES_USER:-udhaarbook}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-udhaarbook}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/postgres-init:/docker-entrypoint-initdb.d:ro   # CREATE EXTENSION pg_trgm;
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-udhaarbook}"]
      interval: 5s
      timeout: 3s
      retries: 20
    ports: ["5432:5432"]

  backend:
    build: .
    # No migrate and no seed here: both are explicit deploy steps owned by Part 29
    # (§29.5.2, §29.6.2). Run `make migrate` once after a clone, and after every pull.
    command: >
      gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 3 --timeout 60
    env_file: [.env]
    volumes:
      - ./media:/app/media
      - ./logs:/app/logs
    depends_on:
      db: {condition: service_healthy}
    ports: ["8000:8000"]

  scheduler:
    build: .
    # Same image, different command. One process, one loop, no broker (ADR-012).
    command: python manage.py run_scheduler --interval 15 --batch 20
    env_file: [.env]
    environment:
      UB_ROLE: scheduler
    volumes:
      - ./media:/app/media
      - ./logs:/app/logs
    depends_on:
      db: {condition: service_healthy}
      backend: {condition: service_started}

  frontend:
    build: ../udhaarbook-frontend
    environment:
      NEXT_PUBLIC_API_BASE_URL: http://localhost:8000/api/v1
    depends_on: [backend]
    ports: ["3000:3000"]

volumes:
  pgdata:
```

The `scheduler` service runs the **same image** as `backend`. That is what makes "swap the runner for Celery later" a truthful claim: the only thing that changes is the container's command.

---

## 20.3 The layering rule

### 20.3.1 What each layer may and may not do

| Layer | May | May **not** |
|---|---|---|
| **URL / router** | Map a path to a view; declare the lookup field as `uuid`. | Contain logic of any kind. |
| **View / ViewSet** | Authenticate, authorise (`permission_classes`), throttle, choose a serializer, call **one** service or selector, wrap the result in the envelope, set response headers (`Idempotent-Replayed`, `X-Request-Id`). | Contain business rules, arithmetic on money, `transaction.atomic()`, direct ORM writes, cross-app model imports, or more than one service call per request. |
| **Serializer** | Declare fields and types; field- and object-level *shape* validation; convert `Decimal → str` on output and `str → Decimal` on input; resolve related ids through tenant-scoped related fields. | Query the database inside `to_representation()`; compute totals; write; call services; know about HTTP status codes. |
| **Service** | Open `transaction.atomic()`, take locks, enforce business invariants, write models, write audit rows, enqueue jobs, call other apps' services, raise `DomainError`. | Import DRF, return `Response`, read `request` (it receives an explicit `actor`/`tenant`/`request_id` context object), format money for display. |
| **Selector** | Build and execute querysets, aggregate, annotate, paginate-ready ordering, `select_related`/`prefetch_related`. | Write anything, open transactions, mutate its arguments. |
| **Model / manager / queryset** | Define columns, constraints, indexes, `TextChoices`, cheap derived `@property`, `__str__`, reusable queryset methods. | Contain business logic in `save()`, post messages, hit the network, compute document totals. |

**The hard rule:** *all business logic lives in `services/`; every read that is more than a trivial filter-by-pk lives in `selectors/`.* If a view has an `if` statement about a business condition, the code is in the wrong place. If a serializer touches two tables, the code is in the wrong place.

The rule exists for one testable reason: **every business behaviour must be reachable without HTTP.** A ledger entry posted by the API, by a CSV import row, by a `platform_job` handler and by a management command must go through the identical function. LED-02 FR-6 says exactly this ("CSV import maps columns to the same service `post_opening_balance()`"), and SAL-02 BR-16 lists twelve ordered side effects that must be identical whether the invoice is issued from the editor or re-issued by a repair command.

### 20.3.2 The service context object

Services need three things from the caller that are not domain arguments: who is acting, which tenant, and the request id for audit/log correlation. Passing `request` would couple services to HTTP and break the "callable from a job" rule. So every service takes an explicit context as its **first keyword-only argument**.

```python
# apps/common/context.py
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:  # pragma: no cover - typing only
    from apps.platform_app.models import Tenant, User

ActorType = Literal["user", "system", "webhook", "super_admin"]


@dataclass(frozen=True, slots=True)
class Ctx:
    """Everything a service needs about the caller, and nothing about HTTP.

    Built by `Ctx.from_request(request)` in views, by `Ctx.system(tenant)` in
    job handlers and management commands. Frozen so a service cannot mutate
    the caller's identity halfway through a transaction.
    """

    tenant: "Tenant"
    actor: "User | None" = None
    actor_type: ActorType = "user"
    request_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    ip: str | None = None
    user_agent: str | None = None
    idempotency_key: str | None = None
    # Free-form audit breadcrumbs, e.g. {"via": "import", "import_job_id": "..."}
    audit_meta: dict[str, object] = field(default_factory=dict)

    @classmethod
    def from_request(cls, request) -> "Ctx":
        from apps.common.tenancy import get_effective_tenant

        tenant = get_effective_tenant(request)
        if tenant is None:  # fail closed — never a service call without a tenant
            raise RuntimeError("Ctx.from_request called without a resolved tenant")
        return cls(
            tenant=tenant,
            actor=request.user if request.user.is_authenticated else None,
            actor_type="super_admin" if getattr(request.user, "is_super_admin", False) else "user",
            request_id=getattr(request, "request_id", str(uuid.uuid4())),
            ip=getattr(request, "client_ip", None),
            user_agent=request.META.get("HTTP_USER_AGENT", "")[:255] or None,
            idempotency_key=request.headers.get("Idempotency-Key"),
        )

    @classmethod
    def system(cls, tenant: "Tenant", *, request_id: str | None = None, **audit_meta) -> "Ctx":
        return cls(
            tenant=tenant,
            actor=None,
            actor_type="system",
            request_id=request_id or str(uuid.uuid4()),
            audit_meta=audit_meta,
        )
```

### 20.3.3 The complete vertical slice — posting a ledger entry

This is LED-01 end to end: URL → viewset → serializer → service → model write → party cache → audit → job enqueue → response. It is the reference implementation every other endpoint copies. Read it as the specification of the pattern, not merely as an example.

**(1) The URL**

```python
# apps/ledger/urls.py
from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.ledger.views.entry import LedgerEntryViewSet, PartyLedgerEntryListCreateView
from apps.ledger.views.reminder import ReminderViewSet
from apps.ledger.views.summary import LedgerAgingView, LedgerSummaryView

router = DefaultRouter()
router.register("ledger-entries", LedgerEntryViewSet, basename="ledger-entry")
router.register("reminders", ReminderViewSet, basename="reminder")

urlpatterns = [
    path(
        "parties/<uuid:party_id>/ledger-entries",
        PartyLedgerEntryListCreateView.as_view(),
        name="party-ledger-entries",
    ),
    path("ledger/summary", LedgerSummaryView.as_view(), name="ledger-summary"),
    path("ledger/aging", LedgerAgingView.as_view(), name="ledger-aging"),
    *router.urls,
]
```

**(2) The viewset — thin by construction**

```python
# apps/ledger/views/entry.py
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated

from apps.common.constants import ModuleCode
from apps.common.context import Ctx
from apps.common.idempotency import idempotent
from apps.common.permissions import HasPermission, ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.viewsets import TenantScopedViewSet
from apps.ledger.filters import LedgerEntryFilterSet
from apps.ledger.models import LedgerEntry
from apps.ledger.selectors.entry import entry_history, get_entry_with_source, list_entries
from apps.ledger.serializers.entry import (
    LedgerEntryCreateSerializer,
    LedgerEntryDetailSerializer,
    LedgerEntrySerializer,
)
from apps.ledger.serializers.correction import CorrectSerializer, ReverseSerializer
from apps.ledger.services.post import post_entry
from apps.ledger.services.correct import correct_entry, reverse_entry


class LedgerEntryViewSet(TenantScopedViewSet):
    """`/ledger-entries` — create, read, reverse, correct. Never update, never delete."""

    queryset = LedgerEntry.objects.all()
    serializer_class = LedgerEntrySerializer
    filterset_class = LedgerEntryFilterSet
    pagination_class = None          # cursor pagination is applied inside the selector
    http_method_names = ["get", "post", "head", "options"]   # immutability at the HTTP layer
    permission_classes = [
        IsAuthenticated,
        ModuleEnabled(ModuleCode.LEDGER),
        HasPermission(
            {
                "list": "ledger.entry.read",
                "retrieve": "ledger.entry.read",
                "create": "ledger.entry.write",
                "reverse": "ledger.entry.correct",
                "correct": "ledger.entry.correct",
            }
        ),
    ]

    @idempotent(scope="ledger_entry")
    def create(self, request, *args, **kwargs):
        serializer = LedgerEntryCreateSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        result = post_entry(ctx=Ctx.from_request(request), **serializer.validated_data)
        return StandardResponse.created(
            data=LedgerEntrySerializer(result.entry, context=self.get_serializer_context()).data,
            meta={"party_balance": str(result.party_balance), "warnings": result.warnings},
        )

    def retrieve(self, request, *args, **kwargs):
        entry = get_entry_with_source(tenant=request.tenant, entry_id=kwargs["pk"])
        return StandardResponse.ok(
            LedgerEntryDetailSerializer(
                entry,
                context={**self.get_serializer_context(), "history": entry_history(entry)},
            ).data
        )

    @action(detail=True, methods=["post"])
    def reverse(self, request, pk=None):
        payload = ReverseSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        result = reverse_entry(ctx=Ctx.from_request(request), entry_id=pk, **payload.validated_data)
        return StandardResponse.created(
            data=LedgerEntrySerializer(result.reversal, context=self.get_serializer_context()).data,
            meta={
                "party_balance": str(result.party_balance),
                "original": {"id": str(result.original.id), "status": result.original.status},
            },
        )

    @action(detail=True, methods=["post"])
    def correct(self, request, pk=None):
        payload = CorrectSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        result = correct_entry(ctx=Ctx.from_request(request), entry_id=pk, **payload.validated_data)
        ser = self.get_serializer_context()
        return StandardResponse.created(
            data={
                "reversal": LedgerEntrySerializer(result.reversal, context=ser).data,
                "replacement": LedgerEntrySerializer(result.replacement, context=ser).data,
            },
            meta={"party_balance": str(result.party_balance)},
        )
```

Note what the viewset does **not** contain: no `transaction.atomic()`, no balance arithmetic, no credit-limit check, no audit write, no SMS decision. All of it is one function call deep.

**(3) The serializers — shape only**

```python
# apps/ledger/serializers/entry.py
from decimal import Decimal

from rest_framework import serializers

from apps.common.constants import Direction, PaymentMode
from apps.common.dates import tenant_today
from apps.common.serializers import MoneyField, TenantPrimaryKeyRelatedField
from apps.ledger.constants import EntryType
from apps.ledger.models import LedgerEntry
from apps.parties.models import Party


class LedgerEntryCreateSerializer(serializers.Serializer):
    """Write shape for POST /ledger-entries. Produces kwargs for `post_entry`."""

    party = TenantPrimaryKeyRelatedField(source="party_id", queryset=Party.objects.all())
    direction = serializers.ChoiceField(choices=Direction.choices)
    amount = MoneyField(min_value=Decimal("0.01"), max_value=Decimal("99999999.99"))
    entry_date = serializers.DateField()
    entry_type = serializers.ChoiceField(
        choices=[EntryType.OPENING], required=False, allow_null=True
    )  # CCR-1: only `opening` may be requested; all others are derived from direction
    note = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    payment_mode = serializers.ChoiceField(choices=PaymentMode.choices, required=False, allow_null=True)
    reference = serializers.CharField(max_length=64, required=False, allow_blank=True, allow_null=True)
    attachment_id = serializers.UUIDField(required=False, allow_null=True)
    override = serializers.BooleanField(required=False, default=False)

    def validate_entry_date(self, value):
        today = tenant_today(self.context["request"].tenant)
        if value > today:
            raise serializers.ValidationError("Date cannot be in the future")
        if value.year < 2000:
            raise serializers.ValidationError("Date is too far in the past")
        return value

    def validate(self, attrs):
        if attrs["direction"] == Direction.CREDIT and not attrs.get("payment_mode"):
            raise serializers.ValidationError({"payment_mode": ["Choose how you received the money"]})
        if attrs["direction"] == Direction.DEBIT:
            attrs["payment_mode"] = None      # LED-01 §10: silently nulled, never an error
            attrs["reference"] = attrs.get("reference") or None
        return attrs


class LedgerEntrySerializer(serializers.ModelSerializer):
    """Read shape per LED-01 §14. Money as strings; no queries in to_representation."""

    amount = MoneyField(read_only=True)
    attachment = serializers.SerializerMethodField()
    created_by = serializers.SerializerMethodField()

    class Meta:
        model = LedgerEntry
        fields = (
            "id", "party_id", "direction", "amount", "entry_date", "entry_type",
            "source_type", "source_id", "note", "payment_mode", "reference",
            "status", "reversed_by_id", "reverses_id", "supersedes_id", "reason",
            "attachment", "created_by", "created_at",
        )
        read_only_fields = fields

    def get_attachment(self, obj):
        # `obj.attachment` is prefetched by the selector; never queried here.
        att = getattr(obj, "attachment", None)
        if att is None:
            return None
        return {"id": str(att.id), "url": att.download_url, "thumb_url": att.thumb_url}

    def get_created_by(self, obj):
        user = obj.created_by          # select_related in the selector
        return None if user is None else {"id": str(user.id), "name": user.full_name}
```

`MoneyField` is `serializers.DecimalField(max_digits=14, decimal_places=2, coerce_to_string=True)` with `localize=False` — canon §0.10 and §22.1 require `"1234.50"` on the wire, never a JSON number.

**(4) The service — where every rule lives**

```python
# apps/ledger/services/post.py
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from django.db import transaction

from apps.common.audit import AuditAction, write_audit
from apps.common.constants import Direction, PaymentMode, SourceType
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.common.jobs import enqueue
from apps.common.money import q2
from apps.ledger.constants import EntryType
from apps.ledger.models import LedgerEntry
from apps.parties.selectors.party import get_party_for_update
from apps.parties.services.balance import apply_balance_delta
from apps.platform_app.selectors.settings import get_setting


@dataclass(frozen=True, slots=True)
class PostEntryResult:
    entry: LedgerEntry
    party_balance: Decimal
    warnings: list[dict]


SIGN = {Direction.DEBIT: Decimal("1"), Direction.CREDIT: Decimal("-1")}


@transaction.atomic
def post_entry(
    *,
    ctx: Ctx,
    party_id,
    direction: str,
    amount: Decimal,
    entry_date: date,
    entry_type: str | None = None,
    note: str = "",
    payment_mode: str | None = None,
    reference: str | None = None,
    attachment_id=None,
    override: bool = False,
    source_type: str = SourceType.MANUAL,
    source_id=None,
) -> PostEntryResult:
    """Post one immutable ledger entry and move the party's cached balance.

    The single entry point for every manual ledger write: API (LED-01),
    opening balance (LED-02 FR-2/FR-6), CSV import, and job handlers.
    Document-sourced entries call `post_document_entry` which delegates here
    with `source_type` set — the invariants below are identical.

    Raises
    ------
    ValidationFailed          amount/date/mode violations the serializer could not catch
    BusinessRuleViolation     party_archived, opening_balance_exists, credit_limit_exceeded
    """
    amount = q2(amount)
    if amount <= 0:
        raise ValidationFailed({"amount": ["Enter an amount greater than 0"]})

    # (a) Lock the party row. LED-01 EC-7: concurrent posts to one party serialise
    #     here, so the cached balance can never interleave. Lock order rule L1
    #     (§20.11.2): party before ledger_entry, always.
    party = get_party_for_update(tenant=ctx.tenant, party_id=party_id)
    if party.status == "archived":
        raise BusinessRuleViolation("party_archived", "This party is archived.")

    # (b) Derive the entry type. Only `opening` may be requested by the caller.
    if entry_type == EntryType.OPENING:
        if LedgerEntry.objects.filter(
            tenant=ctx.tenant, party=party, entry_type=EntryType.OPENING, status="posted"
        ).exists():
            raise BusinessRuleViolation(
                "opening_balance_exists",
                "This party already has an opening balance. Correct it from the entry instead.",
            )
        note = "Opening balance"
    elif entry_type is None:
        entry_type = EntryType.MANUAL_GAVE if direction == Direction.DEBIT else EntryType.MANUAL_GOT

    # (c) Credit-limit rule, LED-01 BR-6. Debit entries only.
    warnings: list[dict] = []
    if direction == Direction.DEBIT and party.credit_limit is not None:
        mode = get_setting(ctx.tenant, "ledger.credit_limit_mode", default="off")
        balance_after = party.balance + amount
        if mode != "off" and balance_after > party.credit_limit:
            payload = {
                "code": "credit_limit_exceeded",
                "limit": str(party.credit_limit),
                "balance_after": str(balance_after),
            }
            if mode == "warn":
                warnings.append(payload)
            elif not override:
                raise BusinessRuleViolation(
                    "credit_limit_exceeded", "Credit limit exceeded.", details=payload
                )
            else:
                ctx.audit_meta.setdefault("override", True)

    # (d) The insert. Immutable from this moment: no code path updates these columns
    #     except `status`/`reversed_by_id` in `correct.py`.
    entry = LedgerEntry.objects.create(
        tenant=ctx.tenant,
        party=party,
        direction=direction,
        amount=amount,
        entry_date=entry_date,
        entry_type=entry_type,
        source_type=source_type,
        source_id=source_id,
        note=note[:255],
        payment_mode=payment_mode if direction == Direction.CREDIT else None,
        reference=reference,
        status="posted",
        created_by=ctx.actor,
    )

    # (e) Move the cached balance. The cache is a projection of (d); `recalc_balances`
    #     recomputes it from scratch and the nightly test asserts zero drift.
    balance = apply_balance_delta(party=party, delta=SIGN[direction] * amount, touch_activity=True)

    # (f) Link the attachment, if any, to its new owner (files app, rule D4).
    if attachment_id:
        from apps.files.services.link import link_attachment

        link_attachment(
            ctx=ctx, attachment_id=attachment_id, owner_type="ledger_entry", owner_id=entry.id
        )

    # (g) Audit. LED-01 §16: full row snapshot, request/idempotency metadata.
    write_audit(
        ctx=ctx,
        action=AuditAction.LEDGER_ENTRY_CREATED,
        entity_type="ledger_entry",
        entity_id=entry.id,
        after=entry.audit_snapshot(),
        metadata={
            **ctx.audit_meta,
            "credit_limit_warning": bool(warnings) or None,
        },
    )
    if override and direction == Direction.DEBIT:
        write_audit(
            ctx=ctx,
            action=AuditAction.LEDGER_CREDIT_LIMIT_OVERRIDDEN,
            entity_type="ledger_entry",
            entity_id=entry.id,
            metadata={"limit": str(party.credit_limit)},
        )

    # (h) Side effects that must not delay the response and must not run if the
    #     transaction rolls back: enqueue after commit (LED-01 FR-9).
    if entry_type in (EntryType.MANUAL_GAVE, EntryType.MANUAL_GOT):
        _maybe_enqueue_party_sms(ctx=ctx, entry=entry, party=party, balance=balance)

    return PostEntryResult(entry=entry, party_balance=balance, warnings=warnings)


def _maybe_enqueue_party_sms(*, ctx: Ctx, entry: LedgerEntry, party, balance: Decimal) -> None:
    """LED-08 gate: party consent AND tenant setting AND a mobile number."""
    if not party.mobile or not party.sms_opt_in:
        return
    if get_setting(ctx.tenant, "ledger.party_sms_on_entry", default="off") != "on":
        return
    enqueue(
        tenant=ctx.tenant,
        job_type="notifications.send_party_entry_sms",
        payload={
            "entry_id": str(entry.id),
            "party_id": str(party.id),
            "balance": str(balance),
            "template": "LEDGER_ENTRY_GAVE" if entry.direction == Direction.DEBIT else "LEDGER_ENTRY_GOT",
        },
        idempotency_token=f"party_sms:{entry.id}",   # §20.8.9: one SMS per entry, ever
        request_id=ctx.request_id,
    )
```

**(5) The party-cache write — the only place `Party.balance` moves**

```python
# apps/parties/services/balance.py
from decimal import Decimal

from django.db.models import F, Q, Sum
from django.utils import timezone

from apps.common.money import q2


def apply_balance_delta(*, party, delta: Decimal, touch_activity: bool = True):
    """Move the cached party balance by `delta` and keep the derived caches true.

    The caller must already hold a row lock on `party` (see LED-01 EC-7). Returns
    the new balance. LED-01 BR-2/BR-3 define the arithmetic:
        balance'         = balance + delta
        receivable_total = max(balance', 0)
        payable_total    = max(-balance', 0)
    """
    balance = q2(party.balance + delta)
    party.balance = balance
    party.receivable_total = max(balance, Decimal("0.00"))
    party.payable_total = max(-balance, Decimal("0.00"))
    fields = ["balance", "receivable_total", "payable_total", "updated_at"]
    if touch_activity:
        party.last_activity_at = timezone.now()     # BR-4: when the user acted, not the entry date
        fields.append("last_activity_at")
    party.save(update_fields=fields)
    return balance


def recompute_party_balance(*, party) -> Decimal:
    """Rebuild the cache from the ledger. The source of truth for `recalc_balances`."""
    agg = party.ledger_entries.filter(status="posted").aggregate(
        debit=Sum("amount", filter=Q(direction="debit")),
        credit=Sum("amount", filter=Q(direction="credit")),
    )
    balance = q2((agg["debit"] or Decimal("0.00")) - (agg["credit"] or Decimal("0.00")))
    party.balance = balance
    party.receivable_total = max(balance, Decimal("0.00"))
    party.payable_total = max(-balance, Decimal("0.00"))
    party.save(update_fields=["balance", "receivable_total", "payable_total", "updated_at"])
    return balance
```

**(6) The model — columns, constraints, no logic**

```python
# apps/ledger/models.py  (excerpt)
from django.db import models

from apps.common.db.fields import MoneyField, uuid7_pk
from apps.common.models import TenantModel
from apps.common.constants import Direction, PaymentMode, SourceType
from apps.ledger.constants import EntryStatus, EntryType


class LedgerEntry(TenantModel):
    """Immutable party ledger line (canon §0.11 rule 1, Part 21 §21.3.4).

    No code path may UPDATE any column other than `status` and `reversed_by_id`;
    the database trigger `forbid_update_delete` enforces this independently.
    """

    id = uuid7_pk()
    party = models.ForeignKey(
        "parties.Party", on_delete=models.RESTRICT, related_name="ledger_entries"
    )
    direction = models.CharField(max_length=6, choices=Direction.choices)
    amount = MoneyField()
    entry_date = models.DateField()
    entry_type = models.CharField(max_length=24, choices=EntryType.choices)
    source_type = models.CharField(max_length=32, choices=SourceType.choices, default=SourceType.MANUAL)
    source_id = models.UUIDField(null=True, blank=True)
    note = models.CharField(max_length=255, blank=True, default="")
    payment_mode = models.CharField(max_length=16, choices=PaymentMode.choices, null=True, blank=True)
    reference = models.CharField(max_length=64, null=True, blank=True)
    status = models.CharField(max_length=10, choices=EntryStatus.choices, default=EntryStatus.POSTED)
    reversed_by = models.ForeignKey("self", null=True, blank=True, on_delete=models.RESTRICT,
                                    related_name="+")
    reverses = models.ForeignKey("self", null=True, blank=True, on_delete=models.RESTRICT,
                                 related_name="reversal_of")
    supersedes = models.ForeignKey("self", null=True, blank=True, on_delete=models.RESTRICT,
                                   related_name="superseded_by")
    reason = models.CharField(max_length=160, null=True, blank=True)
    running_balance_after = MoneyField(null=True, blank=True)   # not populated at MVP (LED-03 BR-8)

    class Meta:
        db_table = "ledger_entry"
        indexes = [
            models.Index(fields=["tenant", "party", "entry_date", "created_at"],
                         name="ix_ledger_party_date"),
            models.Index(fields=["tenant", "source_type", "source_id"], name="ix_ledger_source"),
            models.Index(fields=["tenant", "entry_date"], name="ix_ledger_date"),
            models.Index(fields=["tenant", "-created_at"], name="ix_ledger_recent"),
        ]
        constraints = [
            models.CheckConstraint(check=models.Q(amount__gt=0), name="ck_ledger_amount_positive"),
            models.CheckConstraint(
                check=~models.Q(entry_type=EntryType.REVERSAL) | models.Q(reverses__isnull=False),
                name="ck_ledger_reversal_has_reverses",
            ),
            models.CheckConstraint(
                check=models.Q(direction__in=[Direction.DEBIT, Direction.CREDIT]),
                name="ck_ledger_direction",
            ),
            models.UniqueConstraint(          # LED-02 CCR-4, defence in depth for BR-2
                fields=["party"],
                condition=models.Q(entry_type=EntryType.OPENING, status=EntryStatus.POSTED),
                name="uq_ledger_one_opening_per_party",
            ),
        ]

    def audit_snapshot(self) -> dict:
        """Flat dict of every column, money as strings — used by write_audit()."""
        return {
            "id": str(self.id), "party_id": str(self.party_id), "direction": self.direction,
            "amount": str(self.amount), "entry_date": self.entry_date.isoformat(),
            "entry_type": self.entry_type, "source_type": self.source_type,
            "source_id": str(self.source_id) if self.source_id else None,
            "note": self.note, "payment_mode": self.payment_mode, "reference": self.reference,
            "status": self.status, "reason": self.reason,
        }
```

**(7) The response**

`StandardResponse.created()` produces exactly the canon envelope (§22.1) — this is the DigiKhaato descendant of BrandHub's `StandardResponse` pattern, tightened to the `{data, meta, message}` / `{error:{code,message,details,request_id}}` contract:

```python
# apps/common/responses.py
from rest_framework import status
from rest_framework.response import Response


class StandardResponse:
    """The single place the success envelope is constructed (canon §22.1)."""

    @staticmethod
    def ok(data=None, *, meta=None, message=None, headers=None):
        return StandardResponse._build(data, meta, message, status.HTTP_200_OK, headers)

    @staticmethod
    def created(data=None, *, meta=None, message=None, headers=None):
        return StandardResponse._build(data, meta, message, status.HTTP_201_CREATED, headers)

    @staticmethod
    def accepted(data=None, *, meta=None, message=None, headers=None):
        return StandardResponse._build(data, meta, message, status.HTTP_202_ACCEPTED, headers)

    @staticmethod
    def no_content(headers=None):
        return Response(status=status.HTTP_204_NO_CONTENT, headers=headers)

    @staticmethod
    def _build(data, meta, message, code, headers):
        body: dict = {"data": data}
        if meta is not None:
            body["meta"] = meta
        if message is not None:
            body["message"] = message
        return Response(body, status=code, headers=headers)
```

Final wire result for `POST /api/v1/ledger-entries`:

```json
{
  "data": {
    "id": "0192f3c1-6d2e-7a3b-9f10-4c2b8de10a77",
    "party_id": "0192f3bd-9a11-7c2d-8e44-1f0b2a3c4d5e",
    "direction": "debit", "amount": "500.00", "entry_date": "2026-09-18",
    "entry_type": "manual_gave", "source_type": "manual", "source_id": null,
    "note": "Sugar 10kg", "payment_mode": null, "reference": null,
    "status": "posted", "reversed_by_id": null, "reverses_id": null,
    "supersedes_id": null, "reason": null, "attachment": null,
    "created_by": {"id": "0192f3aa-…", "name": "Akash K"},
    "created_at": "2026-09-18T07:41:22.118Z"
  },
  "meta": {"party_balance": "2800.00", "warnings": []}
}
```

### 20.3.4 The same slice, called from three other places

```python
# 1. From the party-create service (LED-02 FR-2) — one transaction with the party insert
def create_party(*, ctx, opening_balance=None, **fields):
    with transaction.atomic():
        party = Party.objects.create(tenant=ctx.tenant, created_by=ctx.actor, **fields)
        if opening_balance:
            post_entry(ctx=ctx, party_id=party.id, entry_type=EntryType.OPENING, **opening_balance)
        ...

# 2. From a CSV import row (LED-02 FR-6) — batched, same service, system actor allowed
def commit_party_rows(*, ctx, rows):
    for chunk in batched(rows, 500):
        with transaction.atomic():
            for row in chunk:
                party = create_party(ctx=ctx, **row.party_fields)
                if row.opening:
                    post_entry(ctx=replace(ctx, audit_meta={"via": "import",
                                                            "import_job_id": str(ctx.audit_meta["job_id"])}),
                               party_id=party.id, entry_type=EntryType.OPENING, **row.opening)

# 3. From a job handler (no HTTP anywhere in sight)
@job_handler("ledger.post_write_off")
def handle_write_off(job, ctx):
    post_entry(ctx=ctx, party_id=job.payload["party_id"], direction=Direction.CREDIT,
               amount=Decimal(job.payload["amount"]), entry_date=date.fromisoformat(job.payload["date"]),
               entry_type=EntryType.WRITE_OFF, note=job.payload.get("note", ""))
```

### 20.3.5 The exception hierarchy and its mapping to the envelope

Services raise domain exceptions. One DRF exception handler translates them into the canon error envelope and the canon error codes (§22.1). No view ever constructs an error body.

```python
# apps/common/exceptions.py
class DomainError(Exception):
    """Base for every error a service may raise. Never raised directly."""

    code = "server_error"
    http_status = 500
    message = "Something went wrong."

    def __init__(self, message: str | None = None, *, details=None):
        self.message = message or self.message
        self.details = details or {}
        super().__init__(self.message)


class ValidationFailed(DomainError):
    code, http_status, message = "validation_error", 400, "Please check the highlighted fields."

    def __init__(self, details: dict, message: str | None = None):
        super().__init__(message, details=details)


class NotFound(DomainError):
    code, http_status, message = "not_found", 404, "Not found."


class PermissionDenied(DomainError):
    code, http_status, message = "permission_denied", 403, "You do not have permission to do this."


class ModuleDisabled(DomainError):
    code, http_status, message = "module_disabled", 403, "This module is not enabled."


class PlanLimitReached(DomainError):
    code, http_status, message = "plan_limit_reached", 403, "Your plan limit has been reached."


class BusinessRuleViolation(DomainError):
    """409 with a *specific* canon error code chosen by the caller."""

    http_status = 409

    def __init__(self, code: str, message: str, *, details=None):
        self.code = code
        super().__init__(message, details=details)


class StaleVersion(BusinessRuleViolation):
    def __init__(self):
        super().__init__("stale_version", "This record changed since you opened it. Reload and retry.")


class IdempotencyConflict(BusinessRuleViolation):
    def __init__(self):
        super().__init__("idempotency_conflict", "This key was used with a different request body.")
```

```python
# apps/common/exceptions.py (continued)
import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import exceptions as drf_exc
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_default_handler

logger = logging.getLogger("ub.api")


def drf_exception_handler(exc, context):
    """The only producer of the error envelope (canon §22.1).

    Every exception becomes {"error": {code, message, details, request_id}}.
    Cross-tenant access has already become Http404 in the queryset layer, so it
    lands here as `not_found` — never `permission_denied` (canon §0.11 rule 2).
    """
    request = context.get("request")
    request_id = getattr(request, "request_id", None)

    if isinstance(exc, DomainError):
        payload, http_status = _from_domain(exc), exc.http_status
    elif isinstance(exc, Http404):
        payload, http_status = {"code": "not_found", "message": "Not found.", "details": {}}, 404
    elif isinstance(exc, drf_exc.ValidationError):
        payload, http_status = {
            "code": "validation_error",
            "message": "Please check the highlighted fields.",
            "details": exc.detail,
        }, 400
    elif isinstance(exc, drf_exc.NotAuthenticated) or isinstance(exc, drf_exc.AuthenticationFailed):
        payload, http_status = {"code": "unauthenticated", "message": str(exc.detail), "details": {}}, 401
    elif isinstance(exc, drf_exc.PermissionDenied):
        payload, http_status = {"code": "permission_denied", "message": str(exc.detail), "details": {}}, 403
    elif isinstance(exc, drf_exc.Throttled):
        payload, http_status = {
            "code": "rate_limited",
            "message": "Too many requests. Try again shortly.",
            "details": {"retry_after": exc.wait},
        }, 429
    elif isinstance(exc, DjangoValidationError):
        payload, http_status = {
            "code": "validation_error", "message": "Please check the highlighted fields.",
            "details": getattr(exc, "message_dict", {"non_field_errors": exc.messages}),
        }, 400
    else:
        response = drf_default_handler(exc, context)
        if response is None:
            logger.exception("unhandled_exception", extra={"request_id": request_id})
            payload, http_status = {"code": "server_error", "message": "Something went wrong.",
                                    "details": {}}, 500
        else:
            payload, http_status = {"code": "server_error", "message": str(response.data),
                                    "details": {}}, response.status_code

    payload["request_id"] = request_id
    return Response({"error": payload}, status=http_status)


def _from_domain(exc: DomainError) -> dict:
    return {"code": exc.code, "message": exc.message, "details": exc.details}
```

Registered once:

```python
# config/settings/base.py (excerpt)
REST_FRAMEWORK = {
    "EXCEPTION_HANDLER": "apps.common.exceptions.drf_exception_handler",
    "DEFAULT_AUTHENTICATION_CLASSES": ["apps.common.authentication.CookieOrBearerJWTAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_PAGINATION_CLASS": "apps.common.pagination.PagePagination",
    "PAGE_SIZE": 25,
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_THROTTLE_CLASSES": ["apps.common.throttling.ScopedUserRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"user": "600/min", "otp": "5/10min", "otp_ip": "20/hour",
                               "export": "10/hour", "public_link": "60/min"},
    "UNAUTHENTICATED_USER": None,
    "COERCE_DECIMAL_TO_STRING": True,
}
```

---

## 20.4 Multi-tenancy

### 20.4.1 The model: shared schema, `tenant_id` on every business row, fail closed

Part 21 §21.1 fixes the storage model: one database, one schema, a `tenant_id` column on every business table, with PostgreSQL row-level security reserved for Phase 2. The application is therefore the **only** thing standing between tenant A and tenant B at MVP, which is why tenancy is the most heavily tested area of the backend (§20.4.7) and why every default fails closed: *a request with no resolvable tenant sees nothing, never everything.*

The primitive is lifted directly from the working legacy DigiKhaato code (`apps/common/tenancy.py`, `apps/common/viewsets.py`) and extended for this product's richer model — legacy DigiKhaato's tenant is a `User` row with `role="admin"`; this product's tenant is a first-class `Tenant` row reached through `Membership`.

```python
# legacy DigiKhaato, apps/common/viewsets.py — the pattern this design inherits
class TenantScopeMixin:
    tenant_field = "tenant"

    def get_tenant(self):
        return get_effective_tenant(self.request.user)

    def scope_to_tenant(self, qs):
        tenant = self.get_tenant()
        if tenant is None:
            return qs.none()          # ← fail closed: never "all tenants"
        return qs.filter(**{self.tenant_field: tenant})
```

### 20.4.2 `get_effective_tenant()` — resolution order

The tenant is resolved **once per request**, in middleware, and cached on the request object. The order is fixed and exhaustive; there is no fall-through to "any tenant the user belongs to".

```python
# apps/common/tenancy.py
from __future__ import annotations

import contextvars

from apps.common.exceptions import PermissionDenied

_current_tenant: contextvars.ContextVar = contextvars.ContextVar("ub_current_tenant", default=None)


def get_effective_tenant(request):
    """Resolve the tenant for this request. Returns None when there is none.

    Resolution order (normative — do not add steps):

    1. `request.tenant` if middleware already resolved it (memoised).
    2. Super-admin impersonation: token claim `imp` (impersonated tenant id) —
       valid only when the user has `is_super_admin` and the impersonation grant
       row is live; every resolution writes an audit row (§20.4.8).
    3. The `tid` claim on the validated access token. The membership is
       re-checked against the database on every request (a revoked membership
       must not survive until token expiry).
    4. None.

    The `X-Tenant-Id` header is NEVER consulted (canon §22.1). A client that
    wants to change tenant calls POST /auth/switch-tenant and gets a new token.
    """
    cached = getattr(request, "_ub_tenant", "unset")
    if cached != "unset":
        return cached

    tenant = None
    user = getattr(request, "user", None)
    claims = getattr(request, "auth_claims", None) or {}

    if user is not None and getattr(user, "is_authenticated", False):
        impersonated = claims.get("imp")
        if impersonated and getattr(user, "is_super_admin", False):
            tenant = _resolve_impersonation(user, impersonated, request)
        elif claims.get("tid"):
            tenant = _resolve_membership_tenant(user, claims["tid"], claims.get("sid"))

    request._ub_tenant = tenant
    return tenant


def _resolve_membership_tenant(user, tenant_id, session_id):
    from apps.platform_app.models import Membership

    membership = (
        Membership.objects.select_related("tenant", "role")
        .filter(user=user, tenant_id=tenant_id, status="active")
        .first()
    )
    if membership is None:
        return None                      # revoked/suspended → no tenant → fail closed
    if membership.tenant.status not in ("active", "pending_deletion"):
        return None
    # Memoise the role and permission set for the permission classes (§20.5.5).
    membership.tenant._ub_membership = membership
    return membership.tenant


def current_tenant():
    """The tenant for the *current execution context*, for code with no request.

    Set by TenantContextMiddleware for HTTP and by the job runner for each job
    (§20.8.5), so the SQL comment hook and the log formatter can stamp tenant_id
    without threading it through every call.
    """
    return _current_tenant.get()


class TenantContext:
    """`with TenantContext(tenant): ...` — used by the job runner and commands."""

    def __init__(self, tenant):
        self.tenant, self._token = tenant, None

    def __enter__(self):
        self._token = _current_tenant.set(self.tenant)
        return self.tenant

    def __exit__(self, *exc):
        _current_tenant.reset(self._token)
        return False
```

### 20.4.3 The middleware stack

Order matters. `MIDDLEWARE` in `config/settings/base.py`:

```python
MIDDLEWARE = [
    "apps.common.middleware.RequestIdMiddleware",        # 1. X-Request-Id in/out, contextvar
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",         # double-submit for cookie clients
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.middleware.locale.LocaleMiddleware",         # Accept-Language → messages
    "apps.common.middleware.TenantContextMiddleware",    # 2. resolve + bind tenant contextvar
    "apps.common.middleware.AccessLogMiddleware",        # 3. one structured line per request
]
```

```python
# apps/common/middleware.py (tenant part)
class TenantContextMiddleware:
    """Resolve the tenant once and bind it to the execution context.

    DRF authenticates lazily inside the view, so `request.user` here is still
    the session user. The tenant is therefore resolved lazily too: this
    middleware only installs the contextvar *after* the view has run
    authentication, by wrapping the response phase. The authoritative call is
    always `get_effective_tenant(request)`, which memoises.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request._ub_tenant = "unset"
        token = None
        try:
            response = self.get_response(request)
        finally:
            if token is not None:
                _current_tenant.reset(token)
        tenant = getattr(request, "_ub_tenant", None)
        if tenant not in (None, "unset"):
            response["X-Tenant-Scope"] = "1"      # debugging aid, never the tenant id
        return response
```

Because DRF authentication runs inside the view, the binding of `_current_tenant` for logging and SQL comments is performed by `CookieOrBearerJWTAuthentication.authenticate()` itself, immediately after it validates the token — that is the earliest point where the tenant is knowable. The middleware exists to guarantee the attribute is present and to reset the contextvar on the way out even when the view raises.

### 20.4.4 `TenantQuerySet` / `TenantManager` and the `objects` vs `all_objects` policy

```python
# apps/common/managers.py
from django.db import models

from apps.common.tenancy import current_tenant


class TenantQuerySet(models.QuerySet):
    def for_tenant(self, tenant):
        """Explicit scoping — the form every selector uses."""
        if tenant is None:
            return self.none()
        return self.filter(tenant=tenant)

    def alive(self):
        return self.filter(deleted_at__isnull=True)


class TenantManager(models.Manager.from_queryset(TenantQuerySet)):
    """Default manager: hides soft-deleted rows, does NOT auto-scope by tenant.

    Auto-scoping from a thread-local is deliberately rejected: it makes the
    scope invisible at the call site, breaks in management commands and jobs
    that legitimately cross tenants, and turns a missing context into silent
    data loss instead of a loud failure. Scoping is explicit —
    `Model.objects.for_tenant(ctx.tenant)` — and the fail-closed guarantee is
    provided at the boundary (TenantScopedViewSet, selectors), where it is
    testable.
    """

    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)


class AllObjectsManager(models.Manager.from_queryset(TenantQuerySet)):
    """`all_objects` — includes soft-deleted rows. Admin, GC jobs and tests only."""
```

**Policy, normative:**

| Manager | Sees soft-deleted | Auto-scoped by tenant | Allowed callers |
|---|---|---|---|
| `objects` | no | no (must call `.for_tenant()`) | selectors, services, views via `TenantScopedViewSet` |
| `all_objects` | yes | no | Django admin, `files.gc_orphans`, tenant-deletion job, tests |

A model without `deleted_at` (every immutable/ledger table) declares `objects = TenantManager()` with the soft-delete filter omitted by not inheriting `SoftDeleteModel`; `all_objects` is not defined on such models, because there is nothing extra to see.

### 20.4.5 `TenantScopedViewSet`

```python
# apps/common/viewsets.py
from rest_framework import viewsets

from apps.common.tenancy import get_effective_tenant


class TenantScopeMixin:
    """Fail-closed tenant scoping for views (legacy DigiKhaato pattern, this product's model)."""

    tenant_field = "tenant"

    def get_tenant(self):
        return get_effective_tenant(self.request)

    def scope_to_tenant(self, qs):
        tenant = self.get_tenant()
        if tenant is None:
            return qs.none()          # never all-tenants data
        return qs.filter(**{self.tenant_field: tenant})

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "tenant": self.get_tenant()}


class TenantScopedViewSet(TenantScopeMixin, viewsets.ModelViewSet):
    """Every business viewset inherits this. Setting `queryset` is enough.

    `get_object()` therefore looks up inside the scoped queryset: an id that
    belongs to another tenant raises Http404, which the exception handler turns
    into `not_found` — canon §0.11 rule 2, "cross-tenant IDs return 404, never
    403". The 404 is not a courtesy; a 403 would confirm the row exists.
    """

    def get_queryset(self):
        return self.scope_to_tenant(super().get_queryset())
```

For relations submitted in request bodies the same guarantee must hold, or a client could attach tenant B's party to tenant A's invoice. `TenantPrimaryKeyRelatedField` (legacy DigiKhaato's IDOR guard, carried over verbatim in intent) makes a foreign id indistinguishable from a non-existent id:

```python
# apps/common/serializers.py
class TenantPrimaryKeyRelatedField(serializers.PrimaryKeyRelatedField):
    """PrimaryKeyRelatedField whose queryset is scoped to the request tenant.

    Prevents cross-tenant IDOR: an ID belonging to another tenant behaves
    exactly like a non-existent ID ("Invalid pk"), never leaking existence.
    """

    def __init__(self, *args, tenant_field="tenant", **kwargs):
        self.tenant_field = tenant_field
        super().__init__(*args, **kwargs)

    def get_queryset(self):
        qs = super().get_queryset()
        tenant = self.context.get("tenant")
        if qs is None or tenant is None:
            return qs.none() if qs is not None else qs
        return qs.filter(**{self.tenant_field: tenant})
```

### 20.4.6 The header and JWT-claim contract

| Item | Value | Trusted? |
|---|---|---|
| `Authorization: Bearer <access>` | API clients | Yes, after signature + expiry validation |
| Cookie `ub_access` (15 min, httpOnly, `SameSite=Lax`, `Secure` in prod) | browser | Yes, same validation, plus CSRF double-submit on unsafe methods |
| Cookie `ub_refresh` (30 d, path `/api/v1/auth/refresh`) | browser | Yes, only at the refresh endpoint |
| `X-Tenant-Id` | any | **Never.** Ignored entirely; not read by any code. A test asserts that sending it changes nothing. |
| `X-Request-Id` | any | Accepted as a correlation hint only; sanitised to `[A-Za-z0-9._-]{1,64}` and regenerated when malformed. Never used for authorisation. |
| `Idempotency-Key` | client-generated UUID | Used only as a cache key, scoped to `(tenant, user, endpoint)`. |
| `X-CSRF-Token` | browser | Required for cookie-authenticated unsafe methods. |

JWT claims (canon §22.2): `sub` user id, `tid` tenant id, `rol` role code, `sid` session id, `ver` permissions version, `exp`. DigiKhaato adds `imp` (impersonated tenant id) only in super-admin impersonation tokens, and `typ` (`access` | `refresh`). **Claims are inputs to a database check, never a substitute for one:** `rol` renders the UI, but every permission decision re-reads the membership (§20.5.5).

### 20.4.7 The tests that prove isolation

Cross-tenant leakage is the one bug class that would end the product, so it is tested *generatively*, not per-endpoint by hand.

```python
# tests/integration/test_tenant_isolation.py
import pytest
from django.urls import get_resolver

ROUTES_UNDER_TEST = [  # (url name, kwargs factory, method, body factory)
    ("v1:party-detail", lambda f: {"pk": f.other.party.id}, "get", None),
    ("v1:ledger-entry-detail", lambda f: {"pk": f.other.entry.id}, "get", None),
    ("v1:invoice-detail", lambda f: {"pk": f.other.invoice.id}, "get", None),
    # … one row per detail route in the router tree; the test below asserts the
    # list is exhaustive so a new route cannot be added without a leakage test.
]


@pytest.mark.django_db
def test_every_detail_route_returns_404_for_another_tenants_id(two_tenant_fixture, api_client):
    for name, kwargs, method, body in ROUTES_UNDER_TEST:
        url = reverse(name, kwargs=kwargs(two_tenant_fixture))
        response = getattr(api_client(two_tenant_fixture.mine.owner), method)(url, body)
        assert response.status_code == 404, f"{name} leaked: {response.status_code}"
        assert response.json()["error"]["code"] == "not_found"


@pytest.mark.django_db
def test_route_coverage_is_exhaustive():
    """A new detail route must come with a leakage test — this fails the build otherwise."""
    declared = {name for name, *_ in ROUTES_UNDER_TEST}
    detail_routes = {
        name for name in _all_v1_route_names() if name.endswith("-detail") or "/{id}/" in name
    }
    assert detail_routes - declared == set(), f"untested detail routes: {detail_routes - declared}"


@pytest.mark.django_db
def test_x_tenant_id_header_is_ignored(two_tenant_fixture, api_client):
    client = api_client(two_tenant_fixture.mine.owner)
    url = reverse("v1:party-list")
    with_header = client.get(url, HTTP_X_TENANT_ID=str(two_tenant_fixture.other.tenant.id))
    without = client.get(url)
    assert with_header.json()["data"] == without.json()["data"]


@pytest.mark.django_db
def test_write_cannot_reference_another_tenants_party(two_tenant_fixture, api_client):
    client = api_client(two_tenant_fixture.mine.owner)
    response = client.post(reverse("v1:ledger-entry-list"), {
        "party": str(two_tenant_fixture.other.party.id),
        "direction": "debit", "amount": "100.00", "entry_date": "2026-09-18",
    }, format="json")
    assert response.status_code == 400
    assert "party" in response.json()["error"]["details"]


@pytest.mark.django_db
def test_no_tenant_means_empty_not_everything(orphan_user, api_client):
    """A user whose membership was revoked sees nothing, not every tenant's parties."""
    response = api_client(orphan_user).get(reverse("v1:party-list"))
    assert response.status_code in (200, 403)
    if response.status_code == 200:
        assert response.json()["data"] == []
```

A fifth test asserts the *manager* guarantee directly: `assert Party.objects.for_tenant(None).count() == 0` even when the table has rows.

### 20.4.8 Super-admin impersonation

Support needs to see what a merchant sees. The rules are strict because impersonation is the one legitimate way to cross the tenant boundary.

1. Only `platform_user.is_super_admin = true` may request it, through `POST /api/v1/admin/tenants/{id}/impersonate`.
2. The tenant must carry a **consent flag** (`platform_tenant.settings["support_access"] == "granted"`, set by an owner, with an expiry). Without live consent the request is 403 `impersonation_not_consented`.
3. The issued access token carries `imp = <tenant_id>`, `sub = <super admin user id>`, a **5-minute** lifetime, and no refresh token. Re-entry requires a new grant.
4. Every request resolved through the `imp` path writes an audit row (`actor_type = "super_admin"`, `action = "tenant.impersonation.request"`, `metadata = {path, method, request_id}`) — not one row per session, **one row per request**, because the audit trail must answer "what did support look at", not merely "did support log in".
5. Impersonation tokens are **read-only**: `HasPermission` denies every non-safe method when `imp` is present, with `permission_denied` and message "Support sessions are read-only." Writing on a merchant's behalf requires the merchant.
6. The merchant sees an in-app notification (`type = "support_session_started"`) and the session appears in `GET /memberships` style listings as an active support session.

```python
# apps/platform_app/services/impersonation.py (excerpt)
@transaction.atomic
def start_impersonation(*, ctx: Ctx, tenant_id) -> str:
    if not ctx.actor.is_super_admin:
        raise PermissionDenied()
    tenant = Tenant.objects.select_for_update().get(pk=tenant_id)
    grant = tenant.settings_map.get("support_access")
    if not grant or grant.get("status") != "granted" or grant["expires_at"] < now_iso():
        raise BusinessRuleViolation("impersonation_not_consented",
                                    "The business has not granted support access.")
    write_audit(ctx=ctx, action=AuditAction.IMPERSONATION_STARTED, entity_type="tenant",
                entity_id=tenant.id, metadata={"grant_expires_at": grant["expires_at"]})
    notify_tenant_owners(tenant=tenant, type="support_session_started", data={"actor": ctx.actor.full_name})
    return issue_access_token(user=ctx.actor, tenant=tenant, lifetime_minutes=5,
                              extra_claims={"imp": str(tenant.id), "ro": True})
```

---

## 20.5 Authentication and authorisation

### 20.5.1 The token scheme

ADR-011: mobile + password at MVP, OTP verification pluggable through the SMS adapter, SimpleJWT, access 15 minutes, rotating refresh 30 days, browser transport in httpOnly cookies, active tenant in the claims.

| Token | Lifetime | Transport | Claims |
|---|---|---|---|
| access | 15 min | `Authorization: Bearer` (API clients) **or** cookie `ub_access` | `sub`, `tid`, `rol`, `sid`, `ver`, `typ="access"`, `exp`, `iat`, `jti`; optional `imp`, `ro` |
| refresh | 30 d | cookie `ub_refresh`, path `/api/v1/auth/refresh`, or body for API clients | `sub`, `sid`, `fam` (family id), `typ="refresh"`, `exp`, `jti` |

`ver` is the **permissions version**: an integer stored on the membership and bumped whenever the member's role or `permissions_override` changes. The permission layer compares the claim against the database value and, on mismatch, rejects with `401 token_stale` so the client refreshes and re-fetches `/auth/me`. This is what makes a role downgrade take effect in seconds rather than at the end of a 15-minute access-token life, without keeping a revocation list.

```python
# apps/common/authentication.py
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.common.tenancy import _current_tenant


class CookieOrBearerJWTAuthentication(JWTAuthentication):
    """Accept the access token from the Authorization header or the ub_access cookie.

    Browsers use the cookie (httpOnly, so JavaScript cannot exfiltrate it) and
    must additionally present X-CSRF-Token on unsafe methods. API clients use
    the header and are exempt from CSRF because they are not cookie-driven.
    """

    def authenticate(self, request):
        header_result = super().authenticate(request)
        if header_result is None:
            raw = request.COOKIES.get("ub_access")
            if not raw:
                return None
            validated = self.get_validated_token(raw)
            user = self.get_user(validated)
            request._ub_cookie_auth = True
        else:
            user, validated = header_result

        request.auth_claims = dict(validated.payload)
        if validated.payload.get("typ") != "access":
            raise exceptions.AuthenticationFailed("Not an access token.")
        # Bind the tenant contextvar as early as the tenant is knowable (§20.4.3).
        from apps.common.tenancy import get_effective_tenant

        request.user = user
        tenant = get_effective_tenant(request)
        if tenant is not None:
            _current_tenant.set(tenant)
        return user, validated
```

### 20.5.2 Refresh rotation and family detection

`platform_session` (Part 21 §21.3.1) stores one row per issued refresh token, chained by `family_id` and `replaced_by_id`. On `POST /auth/refresh`:

1. Hash the presented refresh token, look up the session row `FOR UPDATE`.
2. If the row does not exist → 401 `invalid_token`.
3. If `revoked_at IS NOT NULL` **or** `replaced_by_id IS NOT NULL` → the token has already been used. This is the classic replay signal: **revoke the entire family** (`UPDATE platform_session SET revoked_at = now() WHERE family_id = ?`), write an audit row `auth.refresh_reuse_detected`, and return 401. Every device in that family must log in again. This is the whole token-theft response at MVP and it is deliberate — it costs a stolen-token holder the account immediately.
4. Otherwise mint a new refresh token in the same family, set `replaced_by_id` on the old row, set its `revoked_at`, and issue a fresh access token.

Rotation is unconditional: there is no "reuse window". Clients must serialise their own refresh calls; the frontend axios interceptor already queues concurrent 401s behind a single refresh (canon ADR-004).

### 20.5.3 Device and session tracking

Each session row records `device_label` (client-supplied, ≤ 64 chars, sanitised), `user_agent`, `ip`, `created_at`, `expires_at`. `GET /auth/me` returns the caller's sessions; `POST /auth/logout` revokes the current session; `POST /auth/logout?all=true` revokes every session for the user. Revocation is a row update, checked on every refresh — access tokens remain valid until their 15 minutes elapse, which is the accepted trade for having no Redis blocklist. Where an immediate cut is required (account compromise), the operator bumps `platform_user.token_epoch`; the claim `ver` check in §20.5.5 rejects every outstanding access token for that user on the next request.

### 20.5.4 The OTP challenge flow

```
POST /auth/otp/request {mobile, purpose}
  ├─ throttle: 5 per mobile per 10 min, 20 per IP per hour  → 429 otp_throttled
  ├─ generate 6 digits with secrets.randbelow(10**6)
  ├─ store platform_otp_challenge{mobile, purpose, code_hash=sha256(code+pepper),
  │                               attempts=0, expires_at=now+5min, ip, device_hint}
  ├─ sms_backend.send(to=mobile, template="OTP_LOGIN", context={"code": code})
  └─ 200 {challenge_id, expires_in: 300, retry_after: 30}       ← never reveals existence

POST /auth/otp/verify {challenge_id, code, device_label}
  ├─ SELECT … FOR UPDATE on the challenge
  ├─ expired → 400 otp_invalid ; verified_at set → 400 otp_invalid
  ├─ attempts >= 5 → 400 otp_invalid {attempts_left: 0} and the challenge is burned
  ├─ constant-time compare of sha256(code+pepper)
  ├─ on failure: attempts += 1, 400 otp_invalid {attempts_left}
  └─ on success: verified_at = now; get_or_create user; issue session + tokens
```

The code never appears in a response, ever, in any environment. In development the `ConsoleSmsBackend` logs it at INFO on the `ub.sms` logger, which is the documented developer path (§20.10.1). The pepper is `settings.OTP_PEPPER`, a distinct secret from `SECRET_KEY`, so a leaked database gives no ability to pre-compute OTP hashes.

Password login (`POST /auth/login`) uses Django's `check_password` with the default `PBKDF2PasswordHasher` (ADR-021 admits no argon2 dependency), a generic `401 invalid_credentials` for both unknown mobile and wrong password, and the same per-mobile throttle. Password rules, lockout and reset flows are specified in Part 27 §27.4.

### 20.5.5 The permission system

**The codename registry.** Canon §0.9 fixes the format `<module>.<resource>.<action>`. The registry is a single module that declares every codename exactly once; nothing else may invent one, and a test asserts that every string passed to `HasPermission` exists in the registry.

```python
# apps/common/permissions_registry.py
from __future__ import annotations

from types import MappingProxyType

from apps.common.constants import ModuleCode, RoleCode

# ── The closed set of permission codenames (canon §0.9) ──────────────────────
PERMISSIONS: frozenset[str] = frozenset({
    "platform.tenant.manage", "platform.members.manage", "platform.branding.manage",
    "platform.audit.read",
    "parties.party.read", "parties.party.write", "parties.party.delete", "parties.party.export",
    "ledger.entry.read", "ledger.entry.write", "ledger.entry.correct",
    "ledger.reminder.write", "ledger.statement.export",
    "inventory.item.read", "inventory.item.write", "inventory.item.delete",
    "inventory.stock.adjust", "inventory.stock.read", "inventory.location.manage",
    "sales.estimate.read", "sales.estimate.write",
    "sales.invoice.read", "sales.invoice.write", "sales.invoice.void",
    "sales.credit_note.write",
    "purchases.bill.read", "purchases.bill.write", "purchases.bill.void",
    "purchases.order.write",
    "payments.payment.read", "payments.payment.write", "payments.payment.void",
    "payments.request.write",
    "expenses.expense.read", "expenses.expense.write", "expenses.expense.void",
    "reports.basic.read", "reports.financial.read", "reports.export",
    "notifications.settings.manage",
})

# Which module each codename belongs to — used by ModuleEnabled and by the
# entitlement filter in GET /permissions/me.
MODULE_OF: dict[str, str] = {p: p.split(".", 1)[0] for p in PERMISSIONS}

# ── System roles (canon §0.9) ────────────────────────────────────────────────
_OWNER = set(PERMISSIONS)                                    # everything

_ADMIN = _OWNER - {"platform.tenant.manage"}                  # not tenant deletion/ownership/billing

_STAFF = {
    "parties.party.read", "parties.party.write",
    "ledger.entry.read", "ledger.entry.write", "ledger.reminder.write",
    "inventory.item.read", "inventory.stock.read",
    "sales.estimate.read", "sales.estimate.write",
    "sales.invoice.read", "sales.invoice.write",
    "purchases.bill.read", "purchases.bill.write",
    "payments.payment.read", "payments.payment.write",
    "expenses.expense.read", "expenses.expense.write",
    "reports.basic.read",
}   # note: no *.void, no ledger.entry.correct, no reports.financial.read, no platform.*
    #       inventory.stock.adjust is OFF by default and granted per member via
    #       Membership.permissions_override (canon §0.9 "stock adjust off by default")

_ACCOUNTANT = {p for p in PERMISSIONS if p.endswith(".read")} | {
    "parties.party.export", "ledger.statement.export", "reports.export",
    "reports.financial.read", "platform.audit.read",
}   # read everything, export everything, no writes

ROLE_PERMISSIONS: MappingProxyType = MappingProxyType({
    RoleCode.OWNER: frozenset(_OWNER),
    RoleCode.ADMIN: frozenset(_ADMIN),
    RoleCode.STAFF: frozenset(_STAFF),
    RoleCode.ACCOUNTANT: frozenset(_ACCOUNTANT),
})


def permissions_for(membership) -> frozenset[str]:
    """Effective permissions = role set, plus allows, minus denies, minus disabled modules.

    `Membership.permissions_override` is `{"allow": [...], "deny": [...]}`.
    Deny always wins. Module gating is applied last so a member can never hold a
    permission for a module the tenant has switched off.
    """
    base = set(ROLE_PERMISSIONS[membership.role.code]) if membership.role.is_system \
        else set(membership.role.permissions)
    override = membership.permissions_override or {}
    base |= set(override.get("allow", []))
    base -= set(override.get("deny", []))
    enabled = set(membership.tenant.enabled_modules)
    return frozenset(p for p in base if MODULE_OF[p] in enabled or MODULE_OF[p] == "platform")
```

The role rows in `platform_role` exist so custom roles (Phase 3) share one storage shape, but for the four system roles the **authority is `ROLE_PERMISSIONS` in code**, not the `permissions text[]` column. A seed command writes the same sets into the rows so that `GET /roles` can serve them, and a test asserts the two never diverge.

**The DRF permission class.**

```python
# apps/common/permissions.py
from rest_framework.permissions import BasePermission

from apps.common.permissions_registry import PERMISSIONS, permissions_for
from apps.common.tenancy import get_effective_tenant


def HasPermission(mapping: str | dict[str, str]):  # noqa: N802 — class factory
    """Declarative per-action permission gate.

    Usage:
        permission_classes = [IsAuthenticated, HasPermission({
            "list": "parties.party.read", "create": "parties.party.write", ...
        })]
    or, for a single-permission view:
        permission_classes = [IsAuthenticated, HasPermission("reports.financial.read")]

    Fail closed twice over: an action missing from the mapping is DENIED (never
    "allowed by default"), and an unresolvable tenant is DENIED.
    """
    required = {"*": mapping} if isinstance(mapping, str) else dict(mapping)
    unknown = set(required.values()) - PERMISSIONS
    if unknown:  # fails at import time, i.e. at deploy time, not at request time
        raise ImproperlyConfigured(f"Unknown permission codename(s): {sorted(unknown)}")

    class _HasPermission(BasePermission):
        message = "You do not have permission to do this."

        def has_permission(self, request, view):
            user = request.user
            if not (user and user.is_authenticated and user.is_active):
                return False
            tenant = get_effective_tenant(request)
            if tenant is None:
                return False
            claims = getattr(request, "auth_claims", {}) or {}
            if claims.get("imp") and request.method not in SAFE_METHODS:
                self.message = "Support sessions are read-only."
                return False                                   # §20.4.8 rule 5
            membership = getattr(tenant, "_ub_membership", None)
            if membership is None:
                return False
            if claims.get("ver") is not None and claims["ver"] != membership.permissions_version:
                raise exceptions.AuthenticationFailed("token_stale")
            codename = required.get(getattr(view, "action", None) or "*") or required.get("*")
            if codename is None:
                return False                                   # unmapped action → denied
            return codename in permissions_for(membership)

        def has_object_permission(self, request, view, obj):
            # Object-level rules that are *about ownership*, not about tenancy
            # (tenancy is already guaranteed by the scoped queryset).
            checker = getattr(view, "check_object_permission", None)
            return True if checker is None else checker(request, obj)

    _HasPermission.__name__ = "HasPermission_" + "_".join(sorted(set(required.values())))[:60]
    return _HasPermission
```

**Object-level checks** exist for the few rules that depend on the row, not the action. The canonical case is SAL-02 §12: *"Delete draft — `sales.invoice.write` (creator or owner/admin)"*. The view declares:

```python
# apps/sales/views/invoice.py (excerpt)
def check_object_permission(self, request, obj):
    if self.action == "destroy":
        membership = request.tenant._ub_membership
        return obj.created_by_id == request.user.id or membership.role.code in ("owner", "admin")
    if self.action in ("update", "partial_update") and obj.status != InvoiceStatus.DRAFT:
        raise BusinessRuleViolation("document_not_draft", "Only drafts can be edited.")
    return True
```

**Module gating and plan entitlements** are two separate classes because they fail with two different canon error codes:

```python
def ModuleEnabled(module: str):            # → 403 module_disabled
    class _ModuleEnabled(BasePermission):
        message = f"The '{module}' module is not enabled for this business."

        def has_permission(self, request, view):
            tenant = get_effective_tenant(request)
            if tenant is None:
                return False
            if module not in tenant.enabled_modules:
                raise ModuleDisabled(self.message)
            if module not in tenant.plan.modules:
                raise ModuleDisabled(self.message)
            if module not in tenant.partner.allowed_modules:
                raise ModuleDisabled(self.message)
            return True
    return _ModuleEnabled


def PlanLimit(limit_key: str, counter):    # → 403 plan_limit_reached
    """Checked at the *action* that consumes the quota (invoice issue, member invite),
    never on reads. `counter(tenant) -> int` lives in the owning app's selectors."""
    class _PlanLimit(BasePermission):
        def has_permission(self, request, view):
            if request.method in SAFE_METHODS:
                return True
            tenant = get_effective_tenant(request)
            cap = (tenant.plan.limits or {}).get(limit_key)
            if cap is not None and counter(tenant) >= cap:
                raise PlanLimitReached(f"Your plan allows {cap}. Contact support to upgrade.")
            return True
    return _PlanLimit
```

A typical viewset therefore reads:

```python
permission_classes = [
    IsAuthenticated,
    ModuleEnabled(ModuleCode.SALES),
    PlanLimit("max_invoices_per_month", counter=invoices_issued_this_month),
    HasPermission({"list": "sales.invoice.read", "retrieve": "sales.invoice.read",
                   "create": "sales.invoice.write", "partial_update": "sales.invoice.write",
                   "destroy": "sales.invoice.write", "issue": "sales.invoice.write",
                   "void": "sales.invoice.void", "share_links": "sales.invoice.read",
                   "upi_intent": "sales.invoice.read"}),
]
```

The three orders matter: authentication, then entitlement (is this module sold and switched on?), then quota, then authorisation (may *this member* do it?). A staff member hitting a module the tenant never bought should be told `module_disabled`, not `permission_denied`.

### 20.5.6 White-label partner scoping

`platform_partner` owns `allowed_modules`, branding defaults, support contact and (Phase 2) hostnames. Partner scoping affects the backend in exactly four places, and nowhere else:

1. **Entitlement ceiling.** `ModuleEnabled` intersects tenant → plan → partner, as above. A partner can never have a tenant with a module the partner does not resell.
2. **Branding resolution.** `GET /tenants/current/branding` returns tenant branding with partner branding as the fallback for each key, resolved by `platform.selectors.branding.resolve_branding(tenant)`. Templates (`notifications_template`) resolve tenant → partner → global, exactly as Part 21 §21.3.2 specifies.
3. **Super-admin scoping.** A partner-scoped super admin (`platform_user.is_super_admin` plus a `partner_id` on the admin grant) sees only that partner's tenants in `/admin/tenants`. Metis Labs' own super admins have no partner restriction.
4. **Messaging sender identity.** `partner.settings["sms_sender_id"]` and DLT template ids are read by the SMS adapter; nothing else in the code knows a partner exists.

Partner is deliberately **not** a row-level scoping dimension: business tables carry `tenant_id` only, and a tenant's partner is reached by one join. Adding `partner_id` to business tables would create a second isolation boundary to test and a second way to get it wrong.

---

## 20.6 The domain services

Five service families carry the whole product's correctness: ledger, stock, document, payment/allocation, and idempotency. Each is specified below with its public signatures, its invariants, its locks and its failure modes. Everything else in the backend is CRUD around them.

### 20.6.1 The ledger service (`apps/ledger/services/`)

**Public surface**

| Function | Module | Purpose |
|---|---|---|
| `post_entry(*, ctx, party_id, direction, amount, entry_date, …)` | `post.py` | Post one entry (§20.3.3). |
| `post_document_entry(*, ctx, party, direction, amount, entry_date, entry_type, source_type, source_id)` | `post.py` | Thin wrapper used by sales/purchases/payments/expenses; forbids `entry_type` values reserved for manual use. |
| `reverse_entry(*, ctx, entry_id, reason)` | `correct.py` | LED-03 reversal. |
| `correct_entry(*, ctx, entry_id, reason, **new_values)` | `correct.py` | LED-03 reversal + replacement, atomic. |
| `reverse_entries_for_source(*, ctx, source_type, source_id, reason)` | `correct.py` | Used by document void: reverses every entry a document produced. |
| `recompute_balance(*, party)` | `apps/parties/services/balance.py` | The recomputation authority. |

**Invariants, enforced in code and in the database**

| Invariant | Enforcement |
|---|---|
| Entries are append-only | No `UPDATE`/`DELETE` path in application code; `http_method_names` on the viewset excludes PUT/PATCH/DELETE; DB trigger `forbid_update_delete` allows only `status` and `reversed_by_id` |
| `amount > 0` always | `CHECK ck_ledger_amount_positive`; a "negative entry" is a `credit`, never a negative debit |
| A reversal always points at what it reverses | `CHECK ck_ledger_reversal_has_reverses` |
| At most one posted `opening` per party | Service check under `FOR UPDATE` + partial unique index `uq_ledger_one_opening_per_party` |
| Balance = Σ posted debits − Σ posted credits | `recompute_balance`; nightly `recalc_balances` asserts zero drift (LED-01 §21 T-11) |
| Document-sourced entries cannot be reversed directly | `reverse_entry` raises `use_document_void` when `source_type != manual` (LED-03 BR-6) |

**`reverse_entry` and `correct_entry`**

```python
# apps/ledger/services/correct.py
@dataclass(frozen=True, slots=True)
class ReverseResult:
    original: LedgerEntry
    reversal: LedgerEntry
    party_balance: Decimal


@dataclass(frozen=True, slots=True)
class CorrectResult(ReverseResult):
    replacement: LedgerEntry


OPPOSITE = {Direction.DEBIT: Direction.CREDIT, Direction.CREDIT: Direction.DEBIT}
MANUAL_ENTRY_TYPES = {EntryType.MANUAL_GAVE, EntryType.MANUAL_GOT, EntryType.OPENING,
                      EntryType.WRITE_OFF}


@transaction.atomic
def reverse_entry(*, ctx: Ctx, entry_id, reason: str) -> ReverseResult:
    """LED-03 FR-4 (a)+(b): mark the original reversed and post its mirror image.

    Lock order (§20.11.2 rule L1): party first, then the entry. Taking them in
    the other order would deadlock against post_entry, which locks the party
    before inserting.
    """
    entry = _get_entry_for_update(ctx.tenant, entry_id)          # locks entry row
    party = get_party_for_update(tenant=ctx.tenant, party_id=entry.party_id)

    if entry.source_type != SourceType.MANUAL:
        raise BusinessRuleViolation(
            "use_document_void",
            "This entry came from a document. Void that document to reverse it.",
            details={"source_type": entry.source_type, "source_id": str(entry.source_id)},
        )
    if entry.status != EntryStatus.POSTED:
        raise BusinessRuleViolation("entry_already_reversed", "This entry is already reversed.")

    reversal = LedgerEntry.objects.create(
        tenant=ctx.tenant, party_id=entry.party_id,
        direction=OPPOSITE[entry.direction],
        amount=entry.amount,                 # BR-1: same amount
        entry_date=entry.entry_date,         # BR-7: same date, so the day nets to zero
        entry_type=EntryType.REVERSAL,
        source_type=SourceType.LEDGER_ENTRY, source_id=entry.id,
        reverses=entry, reason=reason[:160],
        status=EntryStatus.POSTED, created_by=ctx.actor,
    )
    before = entry.audit_snapshot()
    # The only UPDATE the trigger permits on this table.
    LedgerEntry.objects.filter(pk=entry.pk).update(
        status=EntryStatus.REVERSED, reversed_by=reversal
    )
    entry.status, entry.reversed_by = EntryStatus.REVERSED, reversal

    balance = apply_balance_delta(
        party=party, delta=SIGN[reversal.direction] * reversal.amount, touch_activity=True
    )
    write_audit(ctx=ctx, action=AuditAction.LEDGER_ENTRY_REVERSED, entity_type="ledger_entry",
                entity_id=entry.id, before=before, after=entry.audit_snapshot(),
                metadata={"reason": reason, "reversal_id": str(reversal.id)})
    _maybe_enqueue_corrective_sms(ctx=ctx, original=entry, template="LEDGER_ENTRY_REVERSED",
                                  balance=balance)
    return ReverseResult(original=entry, reversal=reversal, party_balance=balance)


@transaction.atomic
def correct_entry(*, ctx: Ctx, entry_id, reason: str, **new) -> CorrectResult:
    """LED-03 FR-4 (a)-(e): reverse, then post the replacement, atomically."""
    original = _get_entry_for_update(ctx.tenant, entry_id)
    if not _differs(original, new):
        raise ValidationFailed({"non_field_errors": [
            "Nothing changed — use Reverse if the entry should not exist."
        ]})
    rev = reverse_entry(ctx=ctx, entry_id=entry_id, reason=reason)   # same transaction

    direction = new.get("direction", original.direction)
    entry_type = original.entry_type
    if entry_type in (EntryType.MANUAL_GAVE, EntryType.MANUAL_GOT):
        entry_type = EntryType.MANUAL_GAVE if direction == Direction.DEBIT else EntryType.MANUAL_GOT
    # BR-3: `opening` stays `opening`, `write_off` stays `write_off`.

    result = post_entry(
        ctx=ctx, party_id=original.party_id, direction=direction,
        amount=new.get("amount", original.amount),
        entry_date=new.get("entry_date", original.entry_date),
        entry_type=entry_type if entry_type != EntryType.OPENING else None,
        note=new.get("note", original.note),
        payment_mode=new.get("payment_mode") if direction == Direction.CREDIT else None,
        reference=new.get("reference", original.reference),
        attachment_id=new.get("attachment_id", None),
        override=True,               # EC-8: owner/admin hold ledger.entry.correct
        _supersedes=original,        # keyword consumed by post_entry to set supersedes_id
    )
    write_audit(ctx=ctx, action=AuditAction.LEDGER_ENTRY_CORRECTED, entity_type="ledger_entry",
                entity_id=original.id, before=rev.original.audit_snapshot(),
                after=result.entry.audit_snapshot(),
                metadata={"reason": reason, "reversal_id": str(rev.reversal.id),
                          "replacement_id": str(result.entry.id)})
    return CorrectResult(original=rev.original, reversal=rev.reversal,
                         replacement=result.entry, party_balance=result.party_balance)
```

`correct_entry` deliberately bypasses the single-opening check by passing `entry_type=None` when the original was an opening, because the original has already been marked `reversed` inside the same transaction and the partial unique index (`WHERE entry_type='opening' AND status='posted'`) therefore admits the replacement. LED-02 BR-5 and LED-03 BR-9 both depend on this ordering — reverse first, then post. A test asserts the ordering by attempting the reverse order and expecting an `IntegrityError`.

**`_differs`** compares exactly the six correctable fields (`amount`, `entry_date`, `note`, `direction`, `payment_mode`, `reference`) using `Decimal` equality for amount, so `"500"` vs `500.00` is *not* a change (LED-03 §10 cross-field rule).

### 20.6.2 The stock service (`apps/inventory/services/`)

**Public surface**

| Function | Purpose |
|---|---|
| `post_movement(*, ctx, item, location, qty, movement_type, movement_date, unit_cost=None, source_type, source_id, reason=None)` | The single writer of `inventory_stock_movement`. |
| `post_movements(*, ctx, lines)` | Batch form used by document issue; takes the item lock in a deterministic order (rule L2). |
| `reverse_movements_for_source(*, ctx, source_type, source_id)` | Void/return path: posts opposite movements with `reverses_id`. |
| `recompute_item_cost(*, item, location)` | Replays the movement log in canonical order, rewrites each row's derived pair and the cache; the authority for `recalc_stock` and the handler behind the `inventory.recompute_item_cost` job. |
| `check_availability(*, tenant, requirements)` | Read-only pre-check used to raise `insufficient_stock` before any write. |

**The weighted-average cost rule, exactly**

**Part 21 §21.3.6 is the normative statement** of the costing rule — the canonical order `(movement_date, sequence_no)`, the six cases of the incremental step, the rounding, the tail/backdated distinction, the void rule and what the drift job compares. This section is its implementation and may not diverge from it. Two implementations that round differently diverge over thousands of movements; two that *order* differently diverge on the first backdated bill, which is the defect Part 41 BE-01 records.

```python
# apps/inventory/services/costing.py
from decimal import Decimal

from apps.common.money import q3, q4

ZERO3, ZERO4 = Decimal("0.000"), Decimal("0.0000")


def next_average_cost(*, on_hand: Decimal, avg_cost: Decimal, qty: Decimal,
                      unit_cost: Decimal | None, reversed_unit_cost: Decimal | None = None
                      ) -> Decimal:
    """One step of the replay. Part 21 §21.3.6 (2), normative — the six cases.

    `reversed_unit_cost` is the `unit_cost` of the row this movement reverses, and is
    None for every movement that is not a reversal. It is what distinguishes a reversal
    of an inbound (value-removing) from a plain outbound (average unchanged).

    Rounding: the quotient is quantised to 4 dp ROUND_HALF_UP, matching numeric(14,4).
    The numerator is computed at full Decimal precision — never quantise the intermediate
    products, or a 3-dp quantity times a 4-dp cost loses paisa on every receipt.
    """
    if reversed_unit_cost is not None and qty < 0:
        # Reversal of an inbound: remove the value that was blended in.
        on_hand_after = on_hand + qty
        if on_hand_after <= 0:
            return ZERO4                      # §21.3.6 (5); the next inbound resets
        total_value = (on_hand * avg_cost) + (qty * reversed_unit_cost)   # qty is negative
        return q4(total_value / on_hand_after)

    if qty > 0:
        cost = reversed_unit_cost if reversed_unit_cost is not None else unit_cost
        if cost is None:                      # inbound with no cost (e.g. a stock-take increase)
            return q4(avg_cost)
        if on_hand <= 0:
            return q4(cost)                   # a restart, not a blend
        total_qty = on_hand + qty
        if total_qty == 0:                    # pathological: an inbound that nets to zero
            return q4(cost)
        return q4(((on_hand * avg_cost) + (qty * cost)) / total_qty)

    return q4(avg_cost)                       # plain outbound: COGS is frozen, average unmoved
```

**`post_movement`**

```python
@transaction.atomic
def post_movement(*, ctx, item, location, qty: Decimal, movement_type: str, movement_date,
                  unit_cost: Decimal | None = None, source_type: str, source_id=None,
                  reason: str | None = None, reverses=None, allow_negative: bool | None = None):
    """Write one immutable stock movement and advance the item-stock cache.

    Preconditions: `item.track_stock` is True and `item.item_type == 'goods'`
    (SAL-02 BR-19: services never move stock). Callers must not call this for
    untracked items — `post_movements` filters them out.
    """
    qty = q3(qty)
    if qty == 0:
        raise ValidationFailed({"qty": ["Quantity cannot be zero"]})

    # Lock the cache row, not the movement table: it is the contended resource, and it
    # is also what allocates sequence_no, so the counter is gap-free without a second lock.
    stock, _ = (
        ItemStock.objects.select_for_update()
        .get_or_create(tenant=ctx.tenant, item=item, variant=None, location=location,
                       defaults={"on_hand": ZERO3, "avg_cost": ZERO4, "last_sequence_no": 0})
    )
    on_hand_before, avg_before = stock.on_hand, stock.avg_cost
    sequence_no = stock.last_sequence_no + 1

    if qty < 0:
        if allow_negative is None:
            allow_negative = get_setting(ctx.tenant, "inventory.allow_negative_stock",
                                         default=False)
        if not allow_negative and on_hand_before + qty < 0:
            raise BusinessRuleViolation(
                "insufficient_stock", f"Only {on_hand_before} in stock.",
                details={"item_id": str(item.id), "on_hand": str(on_hand_before),
                         "requested": str(-qty)},
            )
        if reverses is None:
            unit_cost = avg_before      # plain outbound snapshots COGS at the current average

    if reverses is not None:
        unit_cost = reverses.unit_cost  # a reversal copies the cost of the row it reverses

    # Is this the tail of the canonical order, or an interior insert? Part 21 §21.3.6 (3).
    latest_date = (StockMovement.objects.filter(item=item, location=location)
                   .aggregate(m=Max("movement_date"))["m"])
    is_tail = latest_date is None or movement_date >= latest_date

    on_hand_after = q3(on_hand_before + qty)
    if is_tail:
        avg_after = next_average_cost(
            on_hand=on_hand_before, avg_cost=avg_before, qty=qty, unit_cost=unit_cost,
            reversed_unit_cost=(reverses.unit_cost if reverses is not None else None),
        )
    else:
        avg_after = None                # unknown until the replay; never guessed

    movement = StockMovement.objects.create(
        tenant=ctx.tenant, item=item, location=location, variant=None,
        sequence_no=sequence_no,
        movement_type=movement_type, qty=qty, unit_cost=unit_cost,
        avg_cost_after=avg_after, on_hand_after=(on_hand_after if is_tail else None),
        reason=reason, source_type=source_type, source_id=source_id,
        reverses=reverses, movement_date=movement_date, created_by=ctx.actor,
    )

    fields = {"on_hand": on_hand_after, "last_sequence_no": sequence_no,
              "last_movement_at": timezone.now()}
    if is_tail:
        fields["avg_cost"] = avg_after
    else:
        # Quantity is order-independent and stays exact; the average is not, and is not
        # updated from an interior insert. Mark it stale and recompute after commit.
        fields.update(cost_state="stale", cost_stale_since=timezone.now())
        mark_cost_recompute(item=item, location=location, watermark_date=movement_date)
    ItemStock.objects.filter(pk=stock.pk).update(**fields)
    return movement


def mark_cost_recompute(*, item, location, watermark_date) -> None:
    """Enqueue one recomputation per (item, location, watermark) on commit.

    Idempotent on the token, so a supplier's week of late bills — or a void touching
    twenty lines — collapses into one replay per item and location (Part 21 §21.3.6 (3)).
    """
    enqueue(
        job_type="inventory.recompute_item_cost",
        payload={"item_id": str(item.id), "location_id": str(location.id),
                 "watermark_date": watermark_date.isoformat()},
        tenant=item.tenant, priority=50,
        idempotency_token=(f"recompute_cost:{item.id}:{location.id}"
                           f":{watermark_date.isoformat()}"),
    )   # inside the caller's transaction — the outbox property of §20.8.3
```

`post_movements` sorts its lines by `item_id` before locking (rule L2) and calls `mark_cost_recompute` once per affected `(item, location)` after the batch, not once per line.

**`reverse_movements_for_source`** posts, for each movement of the source document, an opposite movement carrying `reverses=<original>` — so `unit_cost` is a copy of the reversed row's cost and `next_average_cost` applies the value-removing case rather than the plain-outbound case. It then calls `mark_cost_recompute` for every affected `(item, location)` **unconditionally**, whether or not the reversals were tail inserts, because the value-removing step is exact only while the reversed row's cost is still the cost that was blended in, which a reset or an intervening backdated insert can falsify (Part 21 §21.3.6 (4)). This is the call the `PUR-04` void path makes, and it is what honours the promise in Part 15 journey 6 that voiding a bill *recomputes* the average rather than patching one.

**The replay**

```python
def recompute_item_cost(*, item, location) -> tuple[Decimal, Decimal]:
    """Replay every movement for (item, location) in canonical order.

    Pure function of the immutable columns (qty, unit_cost, movement_date, sequence_no,
    reverses_id). Rewrites each row's derived pair and the cache; writes nothing else.
    The two derived columns are the only updates `forbid_update_delete` permits on
    inventory_stock_movement, and only from here (Part 21 §21.3.6).
    """
    on_hand, avg = ZERO3, ZERO4
    costs: dict[UUID, Decimal | None] = {}          # id → unit_cost, for reversal lookups
    qs = (StockMovement.objects.filter(item=item, location=location)
          .order_by("movement_date", "sequence_no")
          .only("id", "qty", "unit_cost", "reverses_id",
                "avg_cost_after", "on_hand_after"))
    updates = []
    for mv in qs.iterator(chunk_size=2000):
        reversed_cost = costs.get(mv.reverses_id) if mv.reverses_id else None
        avg = next_average_cost(on_hand=on_hand, avg_cost=avg, qty=mv.qty,
                                unit_cost=mv.unit_cost, reversed_unit_cost=reversed_cost)
        on_hand = q3(on_hand + mv.qty)
        costs[mv.id] = mv.unit_cost
        if mv.avg_cost_after != avg or mv.on_hand_after != on_hand:
            mv.avg_cost_after, mv.on_hand_after = avg, on_hand
            updates.append(mv)
        if len(updates) >= 2000:
            StockMovement.all_objects.bulk_update(
                updates, ["avg_cost_after", "on_hand_after"])      # the permitted columns
            updates.clear()
    if updates:
        StockMovement.all_objects.bulk_update(updates, ["avg_cost_after", "on_hand_after"])
    ItemStock.objects.update_or_create(
        tenant=item.tenant, item=item, variant=None, location=location,
        defaults={"on_hand": on_hand, "avg_cost": avg,
                  "cost_state": "current", "cost_stale_since": None},
    )
    return on_hand, avg
```

Because a tail insert applies exactly the step the replay's last iteration would apply, **the cache equals the replay by construction** for every tail insert, and every non-tail insert is followed by a replay. There is no third case, and therefore no state in which the two can silently disagree. What the nightly drift job compares, and how a stale row is reported rather than healed, is Part 21 §21.3.6 (7) and §20.11.5 below.

Immutability is enforced as on the ledger: no update path in code except the replay above, a `forbid_update_delete` trigger whose only permitted columns are `avg_cost_after` and `on_hand_after`, and reversal by an opposite movement carrying `reverses_id`. Every column recording a *fact* — `qty`, `unit_cost`, `movement_date`, `sequence_no`, `movement_type` — is immutable.

### 20.6.3 The document service (`apps/sales/services/`, mirrored in `purchases`)

**Numbering — gap-free under concurrency.** `platform_document_sequence` holds `(tenant, kind, fy_label, prefix, next_number, padding)` with `U(tenant, kind, fy_label)`. Allocation happens **inside the issuing transaction** so a rollback returns the number, and under `SELECT … FOR UPDATE` so two concurrent issues serialise (SAL-02 EC-7).

```python
# apps/platform_app/services/sequence.py
@transaction.atomic
def allocate_number(*, tenant, kind: str, document_date, fy_start_month: int) -> tuple[str, str, int]:
    """Allocate the next human number for (tenant, kind, FY). Gap-free, never reused.

    MUST be called inside the caller's transaction (it asserts one is open), so
    that a failure anywhere later in the issue rolls the counter back with
    everything else. A number is consumed only by a committed document; a voided
    document keeps its number forever (Part 21 §21.3.1).
    """
    assert transaction.get_connection().in_atomic_block, "allocate_number needs an open transaction"
    fy_label = fy_label_for(document_date, fy_start_month)        # "2026-27"
    defaults = {"prefix": DEFAULT_PREFIXES[kind], "next_number": 1, "padding": 4}
    seq, _ = (DocumentSequence.objects
              .select_for_update()
              .get_or_create(tenant=tenant, kind=kind, fy_label=fy_label, defaults=defaults))
    n = seq.next_number
    DocumentSequence.objects.filter(pk=seq.pk).update(next_number=n + 1)
    fy_short = f"{fy_label[2:4]}-{fy_label[-2:]}"                 # "26-27"
    number = f"{seq.prefix}/{fy_short}/{n:0{seq.padding}d}"       # SAL-02 BR-14
    if len(number) > 16:                                          # Rule 46 hard limit
        raise BusinessRuleViolation("number_too_long",
                                    "Shorten the number prefix in Settings → Numbering.")
    return number, fy_label, n
```

`get_or_create` under `select_for_update` has a race on first use (two transactions both missing the row). It is handled by the unique constraint: the loser gets `IntegrityError`, which `allocate_number` catches once and retries by re-selecting `FOR UPDATE`. That retry is the only retry loop in the codebase and it is bounded to two attempts.

**Status transitions.** Every document kind declares its legal transitions as data, and one function applies them. Illegal transitions are `409 document_not_draft` / `document_already_void` / a kind-specific code, never a silent no-op.

```python
# apps/sales/constants.py
INVOICE_TRANSITIONS: dict[str, frozenset[str]] = {
    "draft":          frozenset({"issued", "deleted"}),
    "issued":         frozenset({"partially_paid", "paid", "overdue", "void"}),
    "partially_paid": frozenset({"paid", "overdue", "void"}),
    "overdue":        frozenset({"partially_paid", "paid", "void"}),
    "paid":           frozenset({"void", "partially_paid"}),   # a voided payment can reopen it
    "void":           frozenset(),                              # terminal
}
ESTIMATE_TRANSITIONS = {
    "draft": frozenset({"sent", "converted", "deleted"}),
    "sent": frozenset({"accepted", "rejected", "expired", "converted"}),
    "accepted": frozenset({"converted", "expired"}),
    "rejected": frozenset(), "expired": frozenset({"sent"}), "converted": frozenset(),
}
CREDIT_NOTE_TRANSITIONS = {
    "draft": frozenset({"issued", "deleted"}),
    "issued": frozenset({"applied", "void"}),
    "applied": frozenset({"void"}), "void": frozenset(),
}
```

**Tax computation** lives in `sales/services/tax_engine.py` as a **pure function** — no database, no tenant, no ORM — taking a dataclass of inputs and returning a dataclass of computed lines and totals. Purity is what makes the SAL-02 BR-10 worked example a unit test that runs in microseconds and what lets the frontend mirror it exactly (`features/sales/view-model/taxEngine.ts`). The algorithm is SAL-02 BR-1…BR-9 verbatim; the backend implementation is the authority and the client's is a preview (canon §0.11 rule 3).

```python
# apps/sales/services/tax_engine.py (signature and the discount allocation, which is the subtle part)
def compute_document_totals(*, lines: list[LineInput], doc_discount: DiscountInput | None,
                            is_inter_state: bool, round_off_enabled: bool,
                            rates: dict[str, RateSnapshot]) -> DocumentTotals:
    """SAL-02 BR-1…BR-9. Pure: no DB, no tenant, no clock. ROUND_HALF_UP throughout."""


def allocate_proportional(total: Decimal, weights: list[Decimal]) -> list[Decimal]:
    """Split `total` across `weights` so the parts sum EXACTLY to `total` (BR-5).

    Each share is q2(total * w_i / Σw); the residual (always within a few paisa)
    is added to the share of the largest weight, ties broken by lowest index.
    This is the only correct way to allocate money: never distribute the
    remainder evenly, never let the parts fail to sum to the whole.
    """
    total_weight = sum(weights)
    if total_weight == 0:
        return [Decimal("0.00") for _ in weights]
    shares = [q2(total * w / total_weight) for w in weights]
    residual = total - sum(shares)
    if residual != 0:
        target = max(range(len(weights)), key=lambda i: (weights[i], -i))
        shares[target] = q2(shares[target] + residual)
    return shares
```

**Void semantics** (SAL-05, and canon §22.14 step 4): voiding an issued invoice reverses stock (opposite movements with `reverses_id`), reverses the ledger entries the document produced (`reverse_entries_for_source`), sets `status='void'`, `voided_at`, `void_reason`, **keeps the number**, and leaves recorded payments in place as unallocated advances — it deletes the allocations, not the payments. The document is never deleted and its lines are never touched.

### 20.6.4 The payment and allocation service (`apps/payments/services/`)

```python
@transaction.atomic
def record_payment(*, ctx, direction: str, party_id=None, payment_date, mode_breakup: list[dict],
                   allocations: list[dict] | Literal["auto"] | None = None,
                   note: str = "", reference: str | None = None) -> PaymentResult:
    """Record one money event and allocate it (PAY-01, canon §22.9).

    Rules:
      Σ mode_breakup amounts = payment.amount  (else validation_error)
      Σ allocations ≤ payment.amount           (else 409 over_allocated)
      allocations == "auto" → FIFO across the party's open documents, oldest
        document_date first, ties by number; the remainder stays unallocated and
        is visible as an advance on the party balance.
      Posts exactly one ledger entry: payment_in → credit, payment_out → debit.
    """
```

**FIFO allocation.** The candidate set is the party's documents of the matching family (`sales_document` for `direction='in'`, `purchases_document` for `'out'`) with `status IN ('issued','partially_paid','overdue','recorded')` and `amount_due > 0`, ordered by `document_date, number`, selected `FOR UPDATE` **in that same order** (lock-ordering rule L3, §20.11.2). Each document absorbs `min(remaining, amount_due)`.

**Over-allocation guards, three of them:**

1. `Σ allocations ≤ payment.amount` — checked in the service before any write.
2. Per-document: `allocation.amount ≤ document.amount_due` under the document's row lock — `409 over_allocated` with `details.document_id`.
3. Database: `UNIQUE(payment_id, document_type, document_id)` prevents two allocations of one payment to one document, and `CHECK (amount > 0)` prevents a "negative allocation" being used to steal back money.

After allocating, each touched document's `amount_paid` and `amount_due` caches are recomputed from `Σ payments_allocation.amount + Σ sales_credit_application.amount` (never incremented blindly), and the status is moved through the transition table. `payments_payment.unallocated_amount` is set to `amount − Σ allocations`.

**Void** (`void_payment`) reverses the ledger entry, deletes the allocations (cascade), recomputes each affected document's caches and status, sets `status='void'` and `voided_at`, and writes audit. A voided payment's ledger reversal uses `reverse_entries_for_source(source_type='payment', source_id=payment.id)` so the ledger and the payment can never disagree about whether the money exists.

### 20.6.5 The idempotency service (`apps/common/idempotency.py`)

Part 21 does not specify the storage table (SAL-02 §15 flags this as CR-SAL-3); §22.1 specifies the behaviour. **This chapter closes the gap: the table is `platform_idempotency_key`, owned by the `platform` app.**

| Column | Type | Meaning |
|---|---|---|
| `id` | uuid (v7) PK | |
| `tenant_id` | uuid NN, FK RESTRICT | Keys are scoped per tenant (§22.1) |
| `user_id` | uuid NULL, FK SET NULL | The actor who first used the key |
| `key` | varchar(64) NN | The client's `Idempotency-Key` header value |
| `scope` | varchar(48) NN | Endpoint family, e.g. `ledger_entry`, `sales_invoice_issue`, `payment` |
| `request_hash` | char(64) NN | `sha256(canonical_json(body) + method + path)` |
| `status` | varchar(12) NN | `in_progress`, `completed` |
| `response_status` | smallint NULL | Replayed HTTP status |
| `response_body` | jsonb NULL | Replayed envelope |
| `entity_id` | uuid NULL | Convenience pointer to the created row |
| `created_at` | timestamptz NN | |
| `completed_at` | timestamptz NULL | |
| `expires_at` | timestamptz NN | `created_at + 24 h` (§22.1) |

`U(tenant_id, scope, key)`; `IX(expires_at)` for the purge job.

```python
# apps/common/idempotency.py
def idempotent(scope: str):
    """View decorator implementing §22.1 idempotency exactly.

    No key present  → execute normally (the header is required only where the
                      FRD says so; the decorator does not invent a requirement).
    Key + same body + completed   → replay stored response, 200/201 +
                                    `Idempotent-Replayed: true`
    Key + same body + in_progress → 409 `idempotency_conflict` with a retry hint
                                    (the first request is still running)
    Key + different body          → 409 `idempotency_conflict`
    """

    def decorator(view_method):
        @functools.wraps(view_method)
        def wrapper(self, request, *args, **kwargs):
            key = request.headers.get("Idempotency-Key")
            if not key:
                return view_method(self, request, *args, **kwargs)
            tenant = request.tenant
            digest = _request_hash(request)

            # Claim the key with an INSERT. The unique index is the lock: two
            # concurrent identical requests cannot both pass this point.
            try:
                with transaction.atomic():
                    record = IdempotencyKey.objects.create(
                        tenant=tenant, user=request.user, key=key[:64], scope=scope,
                        request_hash=digest, status="in_progress",
                        expires_at=timezone.now() + timedelta(hours=24),
                    )
                    claimed = True
            except IntegrityError:
                record, claimed = IdempotencyKey.objects.get(
                    tenant=tenant, scope=scope, key=key[:64]
                ), False

            if not claimed:
                if record.request_hash != digest:
                    raise IdempotencyConflict()
                if record.status == "in_progress":
                    raise BusinessRuleViolation(
                        "idempotency_conflict",
                        "An identical request is still being processed. Retry in a moment.",
                    )
                response = Response(record.response_body, status=record.response_status)
                response["Idempotent-Replayed"] = "true"
                return response

            response = view_method(self, request, *args, **kwargs)
            if 200 <= response.status_code < 300:
                response.render() if hasattr(response, "render") else None
                IdempotencyKey.objects.filter(pk=record.pk).update(
                    status="completed", response_status=response.status_code,
                    response_body=response.data, completed_at=timezone.now(),
                )
            else:
                # A failed attempt must not burn the key: the user will fix the
                # input and retry with the same key from the same UI state.
                IdempotencyKey.objects.filter(pk=record.pk).delete()
            return response

        return wrapper

    return decorator
```

`_request_hash` canonicalises the JSON body (sorted keys, no whitespace, `Decimal` as string) and folds in the method and path, so `{"a":1,"b":2}` and `{"b":2,"a":1}` are the same request but `POST /ledger-entries` and `POST /payments` with the same key and body are not. The purge of expired rows is a scheduled job (`platform.purge_idempotency_keys`, §20.8.7).

A subtlety worth stating because it bites every implementation: the decorator stores the response **body**, so a replay returns byte-identical data including the `id` of the created row — which is exactly what LED-01 EC-1 requires ("UI de-duplicates by entry `id`").

---

## 20.7 Money and numeric handling

### 20.7.1 The rule

`Decimal` from the database driver to the JSON encoder, with **no `float` anywhere**. `psycopg` returns `numeric` as `Decimal` natively; the only ways a float can enter are `json.loads` of a numeric literal, a `float()` call, or arithmetic with a literal like `0.05`. All three are banned by §26.6 and caught by a grep-based test.

### 20.7.2 Field classes and column types

The custom field classes exist so that a column type is chosen by naming a concept, not by remembering two numbers.

```python
# apps/common/db/fields.py
import uuid6
from django.db import models


def uuid7_pk():
    """Every primary key in the product. Time-ordered (ADR-009), so inserts stay
    at the right edge of the B-tree instead of scattering like uuid4."""
    return models.UUIDField(primary_key=True, default=uuid6.uuid7, editable=False)


class MoneyField(models.DecimalField):
    """numeric(14,2) — every amount a human sees or pays."""

    def __init__(self, **kwargs):
        kwargs.setdefault("max_digits", 14)
        kwargs.setdefault("decimal_places", 2)
        super().__init__(**kwargs)


class QuantityField(models.DecimalField):
    """numeric(14,3) — item quantities, stock on hand, movement qty."""

    def __init__(self, **kwargs):
        kwargs.setdefault("max_digits", 14)
        kwargs.setdefault("decimal_places", 3)
        super().__init__(**kwargs)


class UnitCostField(models.DecimalField):
    """numeric(14,4) — unit prices and weighted-average costs."""

    def __init__(self, **kwargs):
        kwargs.setdefault("max_digits", 14)
        kwargs.setdefault("decimal_places", 4)
        super().__init__(**kwargs)


class RateField(models.DecimalField):
    """numeric(6,3) — tax and discount percentages (0.000 … 999.999)."""

    def __init__(self, **kwargs):
        kwargs.setdefault("max_digits", 6)
        kwargs.setdefault("decimal_places", 3)
        super().__init__(**kwargs)
```

| Concept | Field class | Postgres | Examples |
|---|---|---|---|
| Money | `MoneyField` | `numeric(14,2)` | `ledger_entry.amount`, `sales_document.grand_total`, `parties_party.balance`, `payments_payment.amount` |
| Round-off | `models.DecimalField(max_digits=6, decimal_places=2)` | `numeric(6,2)` | `sales_document.round_off` (bounded to ±0.50) |
| Quantity | `QuantityField` | `numeric(14,3)` | `sales_document_line.qty`, `inventory_item_stock.on_hand`, `inventory_stock_movement.qty` |
| Unit price / cost | `UnitCostField` | `numeric(14,4)` | `sales_document_line.unit_price`, `inventory_item_stock.avg_cost`, `inventory_stock_movement.unit_cost` |
| Percent | `RateField` | `numeric(6,3)` | `tax_rate.rate`, `sales_document_line.tax_rate`, discount percent values |
| Message cost | `models.DecimalField(max_digits=8, decimal_places=4)` | `numeric(8,4)` | `notifications_message_log.cost` |

`inventory_item.purchase_price` and `selling_price` are **money** (`numeric(14,2)`) per Part 21, while a *line's* `unit_price` is a **unit cost** (`numeric(14,4)`) — a price the user types is money; a price used in arithmetic against a 3-dp quantity needs the extra digits. This asymmetry is intentional and must not be "tidied up".

### 20.7.3 Rounding policy, per computation

Canon ADR-010 fixes half-up at line and document level per GST rules. SAL-02 BR-1…BR-9 fixes the order of operations. Restated as a table so no computation is left to judgement:

| Computation | Formula | Quantise to | Mode |
|---|---|---|---|
| Line gross | `qty × unit_price` | 2 dp | `ROUND_HALF_UP` — **once**, on the product, never on the operands |
| Line discount (percent) | `gross × value / 100` | 2 dp | `ROUND_HALF_UP` |
| Line discount (amount) | `min(value, gross)` | 2 dp | `ROUND_HALF_UP` |
| Line taxable, exclusive | `gross − discount` | 2 dp | exact (already 2 dp) |
| Line taxable, inclusive | `net / (1 + (rate+cess)/100)` | 2 dp | `ROUND_HALF_UP` |
| Document discount share | `doc_discount × taxable_i / Σtaxable` | 2 dp | `ROUND_HALF_UP`, **residual to the largest line** (§20.6.3 `allocate_proportional`) |
| CGST | `taxable × rate / 200` | 2 dp | `ROUND_HALF_UP` |
| SGST | `total_tax − cgst` | 2 dp | derived, never rounded again — this is why CGST+SGST always equals the total tax |
| IGST | `taxable × rate / 100` | 2 dp | `ROUND_HALF_UP` |
| Cess | `taxable × cess / 100` | 2 dp | `ROUND_HALF_UP` |
| Round-off | `round(grand_raw, 0) − grand_raw` | 2 dp | `ROUND_HALF_UP` to the rupee; result ∈ [−0.50, +0.49] |
| Weighted-average cost | `(on_hand×avg + qty×cost) / (on_hand+qty)` | 4 dp | `ROUND_HALF_UP`, numerator at full precision |
| Payment allocation residual | — | 2 dp | absorbed by the last document in FIFO order; `Σ allocations` must equal the allocated total exactly |
| Aging bucket sums | `Σ amount` | 2 dp | exact addition of 2-dp values; no rounding |

**Banker's rounding is rejected.** `ROUND_HALF_EVEN` would make `21.375 → 21.38` and `21.385 → 21.38`, which disagrees with the GST convention Indian accountants and every competing product use, and would make the worked example in §22.7 (`21.375 → 21.38`) and the SAL-02 BR-10 table wrong. The decision is: **`ROUND_HALF_UP` everywhere, without exception**, implemented once:

```python
# apps/common/money.py
from decimal import Decimal, ROUND_HALF_UP

TWO, THREE, FOUR = Decimal("0.01"), Decimal("0.001"), Decimal("0.0001")


def D(value) -> Decimal:
    """The only way a string/int becomes a Decimal. Never Decimal(float)."""
    if isinstance(value, Decimal):
        return value
    if isinstance(value, float):            # defence: this should be unreachable
        raise TypeError("float is not allowed in money arithmetic; pass a str or Decimal")
    return Decimal(str(value))


def q2(value) -> Decimal: return D(value).quantize(TWO, rounding=ROUND_HALF_UP)
def q3(value) -> Decimal: return D(value).quantize(THREE, rounding=ROUND_HALF_UP)
def q4(value) -> Decimal: return D(value).quantize(FOUR, rounding=ROUND_HALF_UP)


def to_rupee(value) -> Decimal:
    """Round to whole rupees for the round-off computation (SAL-02 BR-8)."""
    return D(value).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
```

The process-wide decimal context is **not** modified (`getcontext().prec` stays at the default 28 significant digits, which is ample and consistent across Python versions). Rounding is always explicit at the quantise call, never implicit from context.

### 20.7.4 String transport

Serializers emit money, quantities and unit costs as **strings**; percentages as JSON numbers (canon §0.10, §22.1). DRF's `COERCE_DECIMAL_TO_STRING = True` gives this globally, and `MoneyField`/`QuantityField`/`UnitCostField` serializer fields set `coerce_to_string=True` and `localize=False` explicitly so a future settings change cannot silently turn `"1234.50"` into `1234.5`.

On input, a serializer `DecimalField` parses `"500"`, `"500.0"` and `"500.00"` to the same `Decimal` and rejects `500.005` with `validation_error` (LED-01 EC-4: more than 2 dp is a client error, not a value the server rounds). Floats in the request body are rejected: `DecimalField` with `max_digits`/`decimal_places` catches the precision, and a serializer-level check rejects a JSON number where a string was specified, because accepting `1234.5` invites a client to send `0.1 + 0.2`.

A round-trip test is mandatory per money-bearing endpoint: `POST` a value, `GET` it back, assert the exact string.

### 20.7.5 Aggregation

`Sum()` over a `numeric` column returns `Decimal` from Postgres — safe. `Avg()` returns `numeric` too, but `Avg` over money is meaningless for reporting and is only used for analytical endpoints where the result is re-quantised. What is **forbidden** is aggregating in Python over a large queryset (`sum(e.amount for e in qs)`), which loads every row: totals belong in SQL (`aggregate(Sum(...))`), which also gets the tenant filter for free through the scoped queryset.

`ExpressionWrapper` with `output_field=MoneyField()` is required whenever an annotation multiplies or divides, or Django infers `FloatField` and silently reintroduces binary floating point. This is the single most common way money goes wrong in a Django codebase and it is called out in §26.6 with an example.

---

## 20.8 Background work without Celery

### 20.8.1 The shape

ADR-012 is explicit: no Celery, no Redis. Background work is rows in `platform_job` claimed by `python manage.py run_scheduler`, which runs as the compose `scheduler` service (a long-lived loop) and/or from cron (a single drain per invocation). The `enqueue()` API is the seam: if Celery is ever adopted, `enqueue()` changes and no caller does.

```
caller (service)          storage                runner                      handler
────────────────          ───────                ──────                      ───────
enqueue(tenant, type,  →  INSERT platform_job  ←  claim FOR UPDATE       →  @job_handler("…")
        payload, …)       status=queued           SKIP LOCKED                 does the work
                                                  status=running              inside its own
                                                  ... run handler ...         transaction
                                                  status=succeeded/failed
                                                  retry with backoff
                                                  → dead_letter at max
```

### 20.8.2 `platform_job` — the complete table specification

Part 21 references `platform_job` from several FRDs but never specifies its columns. **This section is its normative definition.** It belongs to the `platform` app and follows every rule in Part 21 §21.1.

> **Reconciled 2026-09-18 (CR-001).** Part 21 §21.3.1 has since absorbed this table: the column specification, indexes and cascade behaviour now live there and Part 21 is authoritative for them. This section keeps the operational narrative — runner loop, registry, catalogue, backoff and dead-letter handling — and the two must be changed together.

| Column | Type | Constraints | Meaning |
|---|---|---|---|
| `id` | uuid | PK, default `uuid7()` | |
| `tenant_id` | uuid | FK `platform_tenant` **NULL**, `ON DELETE RESTRICT` | The tenant the work belongs to. NULL for platform-level jobs (e.g. purging expired idempotency keys across all tenants). |
| `job_type` | varchar(64) | NN | Registry key, `<app>.<verb>` — e.g. `notifications.send_party_entry_sms`, `sales.refresh_overdue`, `reports.build_export`, `imports.commit`. Must exist in the registry or the job is dead-lettered immediately. |
| `payload` | jsonb | NN, default `{}` | Handler arguments. **Ids and scalars only** — never a serialized model, never PII beyond ids (§30.3). Max 64 KB, enforced by a `CHECK (pg_column_size(payload) < 65536)`. |
| `status` | varchar(12) | NN, default `queued` | `queued`, `running`, `succeeded`, `failed`, `dead_letter`, `cancelled` |
| `priority` | smallint | NN, default 100 | Lower runs first. Conventions: 10 interactive (a user is waiting: export, import commit), 100 normal (SMS, notification), 200 maintenance (snapshot refresh, purge). |
| `run_after` | timestamptz | NN, default `now()` | Not eligible before this instant. Used for delays and for retry backoff. |
| `attempts` | smallint | NN, default 0 | Incremented on each claim. |
| `max_attempts` | smallint | NN, default 5 | Per-job override; dead-letter when `attempts >= max_attempts`. |
| `locked_at` | timestamptz | NULL | Set at claim; cleared on completion. Drives the visibility timeout. |
| `locked_by` | varchar(64) | NULL | `{hostname}:{pid}:{runner_uuid}` of the claiming runner. |
| `started_at` | timestamptz | NULL | First time this attempt began executing. |
| `finished_at` | timestamptz | NULL | Terminal timestamp (`succeeded`, `dead_letter`, `cancelled`). |
| `result` | jsonb | NULL | Handler return value, for observability. Small — a summary, never a payload dump. |
| `error` | text | NULL | Last exception class + message + truncated traceback (8 KB max). Never contains request bodies or PII. |
| `idempotency_token` | varchar(128) | NULL | Caller-supplied dedupe token; see §20.8.9. |
| `scheduled_key` | varchar(96) | NULL | For recurring jobs: `{job_type}:{period_key}`, e.g. `sales.refresh_overdue:2026-09-18`. |
| `created_by_id` | uuid | FK `platform_user` NULL, `ON DELETE SET NULL` | The human who caused the job, when there is one. |
| `created_at` | timestamptz | NN | |
| `updated_at` | timestamptz | NN | |

**Indexes and constraints**

```sql
-- The claim query's index. Partial, because only queued rows are ever claimed.
CREATE INDEX ix_job_claim ON platform_job (priority, run_after, created_at)
  WHERE status = 'queued';

-- Visibility-timeout sweep.
CREATE INDEX ix_job_stuck ON platform_job (locked_at) WHERE status = 'running';

-- Operator dashboards (Part 30 §30.6).
CREATE INDEX ix_job_tenant_recent ON platform_job (tenant_id, created_at DESC);
CREATE INDEX ix_job_status_recent ON platform_job (status, created_at DESC);

-- Deduplication (§20.8.9): one live job per token.
CREATE UNIQUE INDEX uq_job_idem ON platform_job (tenant_id, job_type, idempotency_token)
  WHERE idempotency_token IS NOT NULL AND status IN ('queued','running','succeeded');

-- Recurring jobs: one row per job type per period, ever.
CREATE UNIQUE INDEX uq_job_scheduled ON platform_job (scheduled_key)
  WHERE scheduled_key IS NOT NULL;

ALTER TABLE platform_job ADD CONSTRAINT ck_job_attempts
  CHECK (attempts >= 0 AND attempts <= max_attempts + 1);
ALTER TABLE platform_job ADD CONSTRAINT ck_job_payload_size
  CHECK (pg_column_size(payload) < 65536);
```

Retention: `succeeded` rows older than 14 days are deleted by `platform.purge_jobs`; `dead_letter` rows are kept 180 days because they are an operator's only record of work that never happened.

### 20.8.3 `enqueue()`

```python
# apps/common/jobs.py
def enqueue(*, job_type: str, payload: dict, tenant=None, priority: int = 100,
            run_after=None, max_attempts: int = 5, idempotency_token: str | None = None,
            scheduled_key: str | None = None, created_by=None, request_id: str | None = None):
    """Queue background work. The only way anything becomes asynchronous.

    Must be called inside a transaction; the INSERT is committed with the caller's
    work, so a job never exists for a transaction that rolled back and never
    goes missing for one that committed. This is the transactional-outbox
    property that makes a broker unnecessary at this scale.
    """
    if job_type not in REGISTRY:
        raise ImproperlyConfigured(f"Unknown job_type {job_type!r}")
    payload = {**payload, "_request_id": request_id} if request_id else payload
    try:
        return Job.objects.create(
            tenant=tenant, job_type=job_type, payload=payload, priority=priority,
            run_after=run_after or timezone.now(), max_attempts=max_attempts,
            idempotency_token=idempotency_token, scheduled_key=scheduled_key,
            created_by=created_by, status=JobStatus.QUEUED,
        )
    except IntegrityError:
        # A live job with this token already exists — that IS the success case.
        logger.info("job.deduplicated", extra={"job_type": job_type, "token": idempotency_token})
        return None
```

Callers that must not run before the outer transaction commits (sending an SMS about a ledger entry) still simply `enqueue()` inside the transaction: the row is invisible to the runner until commit, which is exactly the desired behaviour and is strictly better than `transaction.on_commit`, because `on_commit` work is lost if the process dies between commit and callback. `transaction.on_commit` is reserved for things that are *safe to lose* (cache warmups, the low-stock check in SAL-02 BR-16 step 12).

### 20.8.4 The job-type registry

```python
# apps/common/jobs.py
REGISTRY: dict[str, JobSpec] = {}


@dataclass(frozen=True, slots=True)
class JobSpec:
    handler: Callable[[Job, Ctx], dict | None]
    max_attempts: int = 5
    timeout_seconds: int = 300
    requires_tenant: bool = True


def job_handler(job_type: str, *, max_attempts: int = 5, timeout_seconds: int = 300,
                requires_tenant: bool = True):
    """Register a handler. Handlers live in each app's tasks.py, which is imported
    by that app's AppConfig.ready(), so the registry is complete before the first
    claim."""
    def decorator(fn):
        if job_type in REGISTRY:
            raise ImproperlyConfigured(f"Duplicate job_type {job_type!r}")
        REGISTRY[job_type] = JobSpec(fn, max_attempts, timeout_seconds, requires_tenant)
        return fn
    return decorator
```

**The MVP job catalogue.** This table is the **single normative job registry and job schedule** for the product (Part 0 §0.12; Part 42 CF-13 assigns ownership here). Every one of these must exist; nothing else may be enqueued. Part 29 §29.3.2 no longer carries a second list — it cites this one. A job named in a runbook, an FRD or an NFR and absent from this table does not run, which is exactly how the nightly drift job came to be scheduled nowhere (Part 41 BE-03).

Times are IST. "Fan-out" names the per-tenant child job a periodic parent enqueues (§20.8.7); a parent never iterates tenants inside one execution. A named child is itself a registered job type — it is registered by appearing in that column, and `requires_tenant=True` for every one of them — so "nothing else may be enqueued" covers parents and children alike.

| `job_type` | Owner app | Schedule / trigger | Priority | Idempotency | Fan-out child |
|---|---|---|---|---|---|
| `notifications.send_party_entry_sms` | notifications | `LED-01` FR-9 | 100 | token `party_sms:{entry_id}` | — |
| `notifications.send_reminder_sms` | notifications | `LED-06`/`LED-07`, reminder scheduler | 100 | token `reminder_sms:{reminder_id}` | — |
| `notifications.send_corrective_sms` | notifications | `LED-03` FR-9 | 100 | token `corrective_sms:{entry_id}` | — |
| `notifications.send_invite_sms` | notifications | `PLT` membership invite | 50 | token `invite:{invitation_id}` | — |
| `ledger.schedule_auto_reminders` | ledger | daily 08:00 | 200 | `scheduled_key` per date | `ledger.schedule_auto_reminders_for_tenant` |
| `sales.refresh_overdue` | sales | daily 00:15 | 200 | `scheduled_key` per date | `sales.refresh_overdue_for_tenant` |
| `purchases.refresh_overdue` | purchases | daily 00:15 | 200 | `scheduled_key` per date | `purchases.refresh_overdue_for_tenant` |
| `inventory.scan_low_stock` | inventory | daily 01:00 + after issue | 200 | `scheduled_key` per date | `inventory.scan_low_stock_for_tenant` |
| `inventory.recompute_item_cost` | inventory | backdated movement, void, operator (§20.6.2) | 50 | token `recompute_cost:{item}:{location}:{watermark}` | — |
| `reports.refresh_snapshots` | reports | hourly | 200 | `scheduled_key` per hour | `reports.refresh_snapshots_for_tenant` |
| `reports.partner_usage` | reports | daily 01:00 (`WLB-02` FR-9) | 200 | `scheduled_key` per date | — |
| `reports.build_export` | reports | user requests CSV/XLSX > 5k rows | 10 | token `export:{export_id}` | — |
| `reports.expire_exports` | reports | daily 03:15 (7-day TTL) | 200 | `scheduled_key` per date | — |
| `imports.validate` / `imports.commit` | imports | user uploads / commits | 10 | token `import:{job_id}:{phase}` | — |
| `files.gc_orphans` | files | daily 02:00 (`LED-01` EC-6) | 200 | `scheduled_key` per date | — |
| `platform.verify_hostnames` | platform | hourly (`WLB-03` FR-1) | 200 | `scheduled_key` per hour | — |
| `platform.reconcile_entitlements` | platform | daily 02:00 (`PLT-15` FR-8) | 200 | `scheduled_key` per date | — |
| `platform.purge_idempotency_keys` | platform | hourly | 200 | `scheduled_key` per hour | — |
| `platform.purge_jobs` | platform | daily 02:30 | 200 | `scheduled_key` per date | — |
| `platform.purge_otp_challenges` | platform | hourly | 200 | `scheduled_key` per hour | — |
| `platform.purge_notifications` | platform | weekly Sun 03:45 (180 days) | 200 | `scheduled_key` per week | — |
| `platform.export_tenant_data` | platform | `PLT-10` data-export request | 10 | token `tenant_export:{request_id}` | — |
| `platform.delete_tenant` | platform | `PLT-10` after the 30-day cool-off | 10 | token `tenant_delete:{tenant_id}` | — |
| **`platform.check_invariants`** | platform | **daily 02:45** | 200 | `scheduled_key` per date | `platform.check_invariants_for_tenant` |
| **`parties.recalc_balances`** | parties | **daily 03:00**, report-only | 200 | `scheduled_key` per date | `parties.recalc_balances_for_tenant` |
| **`inventory.recalc_stock`** | inventory | **daily 03:10**, report-only | 200 | `scheduled_key` per date | `inventory.recalc_stock_for_tenant` |
| **`platform.check_expected_runs`** | platform | **hourly** | 100 | `scheduled_key` per hour | — |
| `ops.check_certificates` | platform | daily 04:00 (WARNING inside 21 days) | 200 | `scheduled_key` per date | — |
| `ops.verify_backup` | platform | daily 04:15, after the dump (Part 29 §29.5.1) | 200 | `scheduled_key` per date | — |

The four bold rows are the ones this corpus depended on and did not have. `platform.check_invariants` is the nightly drift detector that NFR-40, goal G3 and the Part 12 §12.5 launch gate all rest on; `parties.recalc_balances` and `inventory.recalc_stock` are its two full-replay companions; `platform.check_expected_runs` is what makes a job that *never ran* louder than a job that failed (§20.8.7). What they compare, their runtime budget, and what happens when they find drift is §20.11.5.

### 20.8.5 The claim query

```python
# apps/common/jobs.py
CLAIM_SQL = """
WITH claimed AS (
    SELECT id
    FROM platform_job
    WHERE status = 'queued'
      AND run_after <= now()
      AND (%(job_types)s::text[] IS NULL OR job_type = ANY(%(job_types)s))
    ORDER BY priority ASC, run_after ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT %(batch)s
)
UPDATE platform_job j
   SET status      = 'running',
       attempts    = j.attempts + 1,
       locked_at   = now(),
       locked_by   = %(worker)s,
       started_at  = COALESCE(j.started_at, now()),
       updated_at  = now()
  FROM claimed
 WHERE j.id = claimed.id
RETURNING j.*;
"""
```

`FOR UPDATE SKIP LOCKED` is the whole concurrency story: any number of runners may run simultaneously and each claims a disjoint batch without blocking. The `CTE + UPDATE … RETURNING` makes claim-and-mark a single round trip, so a runner that dies between the two cannot leave a row claimed-but-not-marked.

### 20.8.6 `run_scheduler` — the loop and its cron invocation

```python
# apps/common/management/commands/run_scheduler.py
class Command(BaseCommand):
    help = "Claim and execute platform_job rows. The whole background system (ADR-012)."

    def add_arguments(self, parser):
        parser.add_argument("--interval", type=int, default=15,
                            help="Seconds to sleep when the queue is empty. 0 = drain and exit.")
        parser.add_argument("--batch", type=int, default=20)
        parser.add_argument("--job-types", nargs="*", default=None,
                            help="Restrict this runner to some job types (queue partitioning).")
        parser.add_argument("--max-runtime", type=int, default=0,
                            help="Exit after N seconds. Used by cron to bound a run.")

    def handle(self, *args, **opts):
        worker = f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:8]}"
        stop = _install_signal_handlers()          # SIGTERM/SIGINT → finish the current job, then exit
        deadline = time.monotonic() + opts["max_runtime"] if opts["max_runtime"] else None

        while not stop.is_set():
            self._reap_stuck_jobs(worker)          # visibility timeout (§20.8.8)
            with advisory_lock(ENQUEUE_LOCK_ID, blocking=False) as held:
                if held:                           # the ONLY serialised step (§20.8.6.1)
                    materialise_due_schedules()    # recurring jobs (§20.8.7)
            jobs = claim_jobs(batch=opts["batch"], worker=worker, job_types=opts["job_types"])
            for job in jobs:
                run_job(job, worker=worker)
            if deadline and time.monotonic() > deadline:
                break
            if not jobs:
                if opts["interval"] == 0:
                    break                          # cron mode: drain once and exit
                stop.wait(opts["interval"])


def run_job(job, *, worker: str) -> None:
    """Execute one job. Never raises: every outcome is written back to the row."""
    spec = REGISTRY.get(job.job_type)
    log = logging.getLogger("ub.jobs")
    if spec is None:
        _dead_letter(job, f"Unknown job_type {job.job_type!r}")
        return

    ctx = Ctx.system(job.tenant, request_id=job.payload.get("_request_id"),
                     job_id=str(job.id), job_type=job.job_type)
    started = time.monotonic()
    try:
        with TenantContext(job.tenant):
            # Each handler owns its transaction: a failing handler must not roll
            # back the bookkeeping UPDATE that records the failure.
            result = spec.handler(job, ctx)
        Job.objects.filter(pk=job.pk).update(
            status=JobStatus.SUCCEEDED, finished_at=timezone.now(), locked_at=None,
            locked_by=None, result=result or {}, error=None, updated_at=timezone.now(),
        )
        log.info("job.succeeded", extra={"job_id": str(job.id), "job_type": job.job_type,
                                         "duration_ms": int((time.monotonic() - started) * 1000),
                                         "tenant_id": str(job.tenant_id or "")})
    except Exception as exc:                        # noqa: BLE001 — a runner must never die
        _handle_failure(job, exc, spec, log, started)
```

#### 20.8.6.1 The scheduler concurrency model — normative, and stated only here

Part 0 §0.12 assigns the scheduler concurrency model to this chapter (Part 42 CF-13). Part 29 §29.3.3 cites this subsection and states no model of its own. Four rules:

| # | Rule |
|---|---|
| **S1** | **Job claiming is `FOR UPDATE SKIP LOCKED` and nothing else** (§20.8.5). Any number of runners may run simultaneously; each claims a disjoint batch; a long job blocks nothing. There is no lock around the tick, and no lock around job execution. |
| **S2** | **One advisory lock, around the periodic-enqueue step only.** `materialise_due_schedules()` is the single step that must not run twice concurrently, and it is a handful of `INSERT`s bounded by the number of schedules. A runner that does not get the lock skips that step and proceeds straight to claiming — it never returns early and never waits. |
| **S3** | **Periodic work fans out as child jobs**, never as a loop inside one handler (§20.8.7). A parent enqueues one child per active tenant and finishes in milliseconds; one slow tenant cannot starve the rest, and the work is resumable and individually retryable. |
| **S4** | **A job that never ran is an alert.** The expected-run registry and `platform.check_expected_runs` (§20.8.7) fire on absence, not only on failure. |

A previous draft of Part 29 held a session advisory lock for the whole tick, including job execution. That serialises the queue behind its slowest job: a ninety-second export blocks the reminder dispatch, the transaction SMS and every other tenant's work, and Part 28 §28.9.1 P9's "drain a 1,000-job backlog in ≤ 60 s" becomes unachievable (Part 41 BE-04, CTO-03). The lock is scoped to S2 for exactly that reason. Its key is `UB_SCHEDULER_ENQUEUE_LOCK_ID`; it is taken non-blocking and released in the same tick.

**Cron invocation.** The compose `scheduler` service runs the loop (`--interval 15`). On a VPS without compose, the same work is done by crontab entries that drain and exit, which is safer under cron because a run can never overlap itself for longer than its own bound:

```cron
# docker/crontab — installed into the scheduler image; used when compose is not the runtime.
# Drain the queue every minute, bounded to 55 s so runs never pile up.
* * * * * cd /app && python manage.py run_scheduler --interval 0 --batch 50 --max-runtime 55 >> /app/logs/scheduler.log 2>&1
# Materialise the daily schedules shortly after midnight IST (18:30 UTC previous day).
30 18 * * * cd /app && python manage.py enqueue_scheduled --period daily >> /app/logs/scheduler.log 2>&1
```

Both modes are supported and neither is special-cased in the code: `--interval 0` is the only difference.

### 20.8.7 Scheduled and recurring jobs

There is no cron *expression* parser in the product. Recurring work is expressed as a table of `(job_type, period)` and materialised into ordinary `platform_job` rows, which is what makes the recurring case identical to the ad-hoc case for everything downstream (retry, dead-letter, observability).

```python
# apps/common/jobs.py
SCHEDULES: list[Schedule] = [
    # One row per periodic entry in the §20.8.4 registry. `grace_minutes` is how late a
    # run may be before platform.check_expected_runs reports its absence (rule S4).
    Schedule("sales.refresh_overdue",           period="daily",  at_hour_ist=0,  minute=15, grace_minutes=60),
    Schedule("purchases.refresh_overdue",       period="daily",  at_hour_ist=0,  minute=15, grace_minutes=60),
    Schedule("inventory.scan_low_stock",        period="daily",  at_hour_ist=1,  minute=0,  grace_minutes=60),
    Schedule("reports.partner_usage",           period="daily",  at_hour_ist=1,  minute=0,  grace_minutes=120),
    Schedule("files.gc_orphans",                period="daily",  at_hour_ist=2,  minute=0,  grace_minutes=120),
    Schedule("platform.reconcile_entitlements", period="daily",  at_hour_ist=2,  minute=0,  grace_minutes=120),
    Schedule("platform.purge_jobs",             period="daily",  at_hour_ist=2,  minute=30, grace_minutes=120),
    Schedule("platform.check_invariants",       period="daily",  at_hour_ist=2,  minute=45, grace_minutes=60),
    Schedule("parties.recalc_balances",         period="daily",  at_hour_ist=3,  minute=0,  grace_minutes=120),
    Schedule("inventory.recalc_stock",          period="daily",  at_hour_ist=3,  minute=10, grace_minutes=120),
    Schedule("reports.expire_exports",          period="daily",  at_hour_ist=3,  minute=15, grace_minutes=120),
    Schedule("ops.check_certificates",          period="daily",  at_hour_ist=4,  minute=0,  grace_minutes=180),
    Schedule("ops.verify_backup",               period="daily",  at_hour_ist=4,  minute=15, grace_minutes=180),
    Schedule("ledger.schedule_auto_reminders",  period="daily",  at_hour_ist=8,  minute=0,  grace_minutes=30),
    Schedule("platform.purge_notifications",    period="weekly", weekday=6,      at_hour_ist=3, minute=45, grace_minutes=240),
    Schedule("reports.refresh_snapshots",       period="hourly", grace_minutes=30),
    Schedule("platform.verify_hostnames",       period="hourly", grace_minutes=60),
    Schedule("platform.purge_idempotency_keys", period="hourly", grace_minutes=60),
    Schedule("platform.purge_otp_challenges",   period="hourly", grace_minutes=60),
    Schedule("platform.check_expected_runs",    period="hourly", grace_minutes=60),
]


def materialise_due_schedules(now=None) -> int:
    """Insert one job row per (schedule, period) that is due and not yet created.

    `scheduled_key` + its unique index make this safe to call from every runner
    on every tick: the second caller's INSERT fails and is swallowed. That is
    the entire distributed-cron implementation.
    """
    created = 0
    for schedule in SCHEDULES:
        key = schedule.period_key(now)                  # "sales.refresh_overdue:2026-09-18"
        if not schedule.is_due(now):
            continue
        try:
            with transaction.atomic():
                Job.objects.create(job_type=schedule.job_type, payload={}, tenant=None,
                                   priority=200, scheduled_key=key, status=JobStatus.QUEUED,
                                   run_after=schedule.run_after(now))
                created += 1
        except IntegrityError:
            pass                                         # already materialised — normal
    return created
```

**Per-tenant fan-out is one child job per tenant** (rule S3). A periodic parent runs once with `tenant_id = NULL` and its whole body is: select the active tenants, enqueue one `<job_type>_for_tenant` child each with `scheduled_key = "<child>:{tenant_id}:{date}"`, and record `{"tenants": 812, "enqueued": 812}`. It does no tenant work itself and finishes in milliseconds. A child that fails retries and dead-letters on its own; one slow or broken tenant cannot starve the rest, and a partial night is resumable because the children that succeeded are already marked. The earlier design — one handler iterating every tenant inside a single execution — is O(tenants) in one job and is what made a bad tenant able to starve the others (Part 41 CTO-03).

**The expected-run registry and positive-confirmation alerting** (rule S4). `SCHEDULES` above *is* the registry: each row is `(job_type, period, time, grace_minutes)`. `platform.check_expected_runs` runs hourly and reports every row whose `scheduled_key` for the current period either does not exist or has not reached `succeeded` by `due_at + grace_minutes`. The report is an operator alert (`job.expected_run_missing`, Part 30 §30.10). This closes the failure the collection journey depends on: `ledger.schedule_auto_reminders` deduplicates on `scheduled_key`, so a day on which it was never enqueued leaves no row, no dead letter and — before this job — no alert at all (Part 41 BE-03, CTO-03). Silent non-delivery of the collection nudge is now louder than a failure.

### 20.8.8 Visibility timeout, retry, backoff, dead-letter

**Visibility timeout.** A runner that is SIGKILLed leaves a row `running` with a stale `locked_at`. Every tick, before claiming, each runner reaps them:

```python
def reap_stuck_jobs(worker: str) -> int:
    """Return jobs whose lock has expired to the queue. The visibility timeout is
    per job type (`JobSpec.timeout_seconds`, default 300 s) with a 60 s grace."""
    reaped = 0
    for job_type, spec in REGISTRY.items():
        cutoff = timezone.now() - timedelta(seconds=spec.timeout_seconds + 60)
        reaped += Job.objects.filter(
            status=JobStatus.RUNNING, job_type=job_type, locked_at__lt=cutoff
        ).update(status=JobStatus.QUEUED, locked_at=None, locked_by=None,
                 run_after=timezone.now(), error="reclaimed after visibility timeout",
                 updated_at=timezone.now())
    return reaped
```

Because `attempts` was already incremented at claim time, a job that repeatedly kills its runner still reaches `max_attempts` and dead-letters instead of looping forever.

**Retry with exponential backoff.**

```python
BASE_BACKOFF_SECONDS = 30
MAX_BACKOFF_SECONDS = 3600


def backoff_for(attempts: int) -> timedelta:
    """30 s, 60 s, 120 s, 240 s, 480 s … capped at 1 h, with ±20 % jitter so a
    thousand SMS jobs failing at once do not retry in lockstep."""
    base = min(BASE_BACKOFF_SECONDS * (2 ** max(attempts - 1, 0)), MAX_BACKOFF_SECONDS)
    jitter = base * 0.2 * (random.random() * 2 - 1)
    return timedelta(seconds=base + jitter)


def _handle_failure(job, exc, spec, log, started) -> None:
    permanent = isinstance(exc, PermanentJobError)
    attempts, max_attempts = job.attempts, job.max_attempts or spec.max_attempts
    error = f"{type(exc).__name__}: {exc}\n{traceback.format_exc()[:8192]}"
    if permanent or attempts >= max_attempts:
        Job.objects.filter(pk=job.pk).update(
            status=JobStatus.DEAD_LETTER, finished_at=timezone.now(), locked_at=None,
            locked_by=None, error=error, updated_at=timezone.now())
        log.error("job.dead_letter", extra={"job_id": str(job.id), "job_type": job.job_type,
                                            "attempts": attempts, "tenant_id": str(job.tenant_id or ""),
                                            "error_class": type(exc).__name__})
        _notify_operator_of_dead_letter(job)
    else:
        Job.objects.filter(pk=job.pk).update(
            status=JobStatus.QUEUED, locked_at=None, locked_by=None,
            run_after=timezone.now() + backoff_for(attempts), error=error,
            updated_at=timezone.now())
        log.warning("job.retrying", extra={"job_id": str(job.id), "job_type": job.job_type,
                                           "attempts": attempts, "next_in_s": ...})
```

`PermanentJobError` is raised by a handler that knows retrying cannot help — an unknown template code, a deleted entity, a malformed payload. Everything else (network, lock timeout, transient database error) retries.

**Dead-letter behaviour.** A dead-lettered job is never retried automatically. It stays in the table with its final `error`, is surfaced on the super-admin operations page and by the SQL in Part 30 §30.9, and can be requeued by an operator with `manage.py requeue_job <id>` (which resets `status='queued'`, `attempts=0`, `error=NULL` and writes an audit row). For jobs whose failure has a user-visible consequence (`reports.build_export`, `imports.commit`), the handler's dead-letter path also writes a `notifications_notification` so the merchant is told the export failed rather than watching a spinner forever.

### 20.8.9 Idempotent handlers

Every handler **must** be safe to run twice, because at-least-once is the only delivery guarantee this design offers (a runner can die after the work and before the status update). Three mechanisms, used together:

1. **Enqueue-time dedupe.** `idempotency_token` + the partial unique index means "one SMS per ledger entry, ever" is enforced at insert. A second `enqueue()` with the same token returns `None` and logs `job.deduplicated`.
2. **Handler-level natural keys.** `notifications.send_party_entry_sms` first checks for an existing `notifications_message_log` row with `related_type='ledger_entry', related_id=<id>` in a non-`failed` state and returns early if found.
3. **Idempotent domain services.** The services the handlers call are themselves idempotent where it matters: `sales.refresh_overdue` computes a status from data rather than toggling it; `recalc_balances` is a recomputation; `files.gc_orphans` deletes by predicate.

```python
# apps/notifications/tasks.py
@job_handler("notifications.send_party_entry_sms", max_attempts=3, timeout_seconds=30)
def send_party_entry_sms(job, ctx) -> dict:
    entry_id = job.payload["entry_id"]
    if MessageLog.objects.filter(tenant=ctx.tenant, related_type="ledger_entry",
                                 related_id=entry_id, status__in=("queued", "sent", "delivered")
                                 ).exists():
        return {"skipped": "already_sent"}          # mechanism 2
    party = Party.objects.for_tenant(ctx.tenant).filter(pk=job.payload["party_id"]).first()
    if party is None or not party.mobile or not party.sms_opt_in:
        raise PermanentJobError("party missing or not consented")     # never retry
    return send_templated_sms(ctx=ctx, party=party, template_code=job.payload["template"],
                              context={"balance": job.payload["balance"]},
                              related=("ledger_entry", entry_id))
```

### 20.8.10 The local development story

- `python manage.py run_scheduler --interval 5` in a second terminal is the normal way to develop against jobs.
- `UB_JOBS_EAGER=1` (read in `config/settings/local.py` and `test.py`) makes `enqueue()` execute the handler **inline, after the current transaction commits**, via `transaction.on_commit`. This is how tests assert job side effects without running a loop, and how a developer who forgot the second terminal still sees SMS lines in the console.
- `python manage.py run_scheduler --interval 0` drains once and exits — the command a test or a CI step uses.
- `python manage.py jobs ls --status dead_letter --since 24h` and `jobs show <id>` are small operator commands that print the table (Part 30 §30.6).
- Because the console SMS backend logs at INFO and jobs log structured events, the whole asynchronous surface is visible in one terminal with no extra infrastructure. That is the point of ADR-012.

---

## 20.9 Files and media

### 20.9.1 Layout under `MEDIA_ROOT`

ADR-013: local disk through Django's storage API; S3 is a settings switch later. The path layout is chosen so that (a) a tenant's bytes are contiguous and easy to export or delete wholesale (PLT-10), (b) no directory ever holds more than a few thousand entries, and (c) the key is unguessable.

```
MEDIA_ROOT/
└── t/<tenant_id>/                      # one directory per tenant: export = tar this, delete = rm -rf
    ├── logo/<yyyy>/<mm>/<uuid7>.<ext>
    ├── signature/<yyyy>/<mm>/<uuid7>.<ext>
    ├── item_image/<yyyy>/<mm>/<uuid7>.<ext>
    ├── item_image/<yyyy>/<mm>/<uuid7>.thumb.webp
    ├── bill_photo/<yyyy>/<mm>/<uuid7>.<ext>
    ├── receipt/<yyyy>/<mm>/<uuid7>.<ext>
    ├── import_file/<yyyy>/<mm>/<uuid7>.csv
    └── export_file/<yyyy>/<mm>/<uuid7>.csv
```

`files_attachment.storage_key` holds the path relative to `MEDIA_ROOT` (`t/<tenant>/bill_photo/2026/09/0192f3….jpg`) and is unique. The filename is a fresh UUID v7, **never** the user's filename — the original is kept in `original_name` for display and download, and is never used to build a path, which removes path traversal as a category.

```python
# apps/common/storage.py
def tenant_media_path(*, tenant_id, kind: str, extension: str) -> str:
    """Build the storage key. The ONLY place a media path is constructed."""
    if kind not in ATTACHMENT_KINDS:
        raise ValueError(f"Unknown attachment kind {kind!r}")
    today = timezone.now()
    name = f"{uuid6.uuid7().hex}{_safe_extension(extension)}"
    return f"t/{tenant_id}/{kind}/{today:%Y}/{today:%m}/{name}"
```

### 20.9.2 Upload validation

Validation is **content-based, not name-based**, and runs before a single byte is written to `MEDIA_ROOT`.

| Check | Rule | Failure |
|---|---|---|
| Size | ≤ 10 MB per file; `logo`/`signature` ≤ 2 MB; `import_file` ≤ 5 MB | 400 `file_too_large` |
| Declared type | `content_type` ∈ the kind's allow-list | 400 `unsupported_file_type` |
| Real type | Magic bytes verified: images via `Pillow.Image.open(...).verify()`, CSV by decoding the first 64 KB as UTF-8/UTF-8-BOM and parsing a header row | 400 `unsupported_file_type` |
| Dimensions | Image ≤ 8000 × 8000 px before resize; decompression-bomb guard `Image.MAX_IMAGE_PIXELS` set to 40 MP | 400 `image_too_large` |
| Extension | Derived from the **verified** type, not from the upload's name | — |
| Hash | `sha256` computed and stored; a duplicate `(tenant, sha256, kind)` returns the existing attachment instead of storing again | — |

Allow-lists per kind: `logo`, `signature`, `item_image`, `bill_photo`, `receipt` → `image/jpeg`, `image/png`, `image/webp`; `import_file` → `text/csv`, `text/plain`; `export_file`, `document_pdf` → generated server-side only, never uploaded.

SVG is **not** accepted for any kind. An SVG is a script container; accepting one for a tenant logo that is then rendered in every merchant's print view would be a stored-XSS vector with no upside.

### 20.9.3 Image compression

Pillow is the only image dependency (ADR-021). On upload of an image kind:

1. `Image.open()` → `verify()` → reopen (Pillow requires a reopen after verify).
2. Convert to RGB (drops alpha for JPEG; PNG with alpha is preserved as PNG).
3. **Strip EXIF entirely** by re-encoding from the pixel data — geolocation in a bill photo is PII the product has no reason to keep (Part 27 §27.7).
4. Resize so the longest edge ≤ 1600 px for `bill_photo`/`receipt`/`item_image`, ≤ 512 px for `logo`/`signature`, preserving aspect ratio, `Image.LANCZOS`.
5. Re-encode: JPEG quality 82 progressive, or WebP quality 82 when the source was WebP or had alpha.
6. Generate a 256 px thumbnail for `item_image` and `bill_photo` (`<key>.thumb.webp`).

The client already compresses to ~300 KB before upload (LED-01 §5), so server-side compression is a guarantee rather than the primary mechanism — it exists because a non-browser client will eventually POST a 12 MP photo.

### 20.9.4 Serving files: authenticated and public

Two paths, and they are genuinely different.

**Authenticated:** `GET /api/v1/attachments/{id}/download`. The view loads the attachment through the tenant-scoped queryset (cross-tenant → 404), checks the permission implied by the owner entity, then streams with `FileResponse`. In production the actual bytes are handed to the web server with `X-Accel-Redirect` (nginx) / `X-Sendfile`, so Python is not in the byte path — but the **authorisation decision is always Django's**. `MEDIA_URL` is not publicly routable.

**Public share links:** documents and statements shared with a customer (`POST /parties/{id}/share-links`, `POST /sales/invoices/{id}/share-links`, canon §22.4/§22.7). The security model is specified fully in Part 27 §27.12; the architecture is:

| Property | Design |
|---|---|
| Token | 32 bytes from `secrets.token_urlsafe(32)` → 43 URL-safe chars, ~256 bits |
| Storage | **Hash only** — `sha256(token)` in `sales_document.public_token_hash` / `parties_share_link.token_hash`. The plaintext token exists once, in the response that creates it. A database leak does not yield working links. |
| URL | `https://<host>/d/<token>` (frontend route) → `GET /api/v1/public/d/{token}` (API). **No tenant id, no party id, no document number, no mobile number in the URL.** |
| Expiry | `expires_at`, default 7 days, max 90; enforced server-side on every fetch |
| Revocation | `revoked_at`; the owner can revoke from the document page; revoked → 404 |
| Enumeration | Constant-time lookup by hash; identical 404 for wrong, expired and revoked tokens; throttle scope `public_link` at 60/min/IP |
| Content | A redacted serializer (`serializers/public.py`): document/statement content, tenant branding and contact, **no** internal ids, no other parties, no cost prices, no audit data |
| Access log | Each fetch increments `view_count` and writes a `notifications_notification`-free audit row `document.public_viewed` with the truncated IP; the merchant can see "viewed 3 times" |

### 20.9.5 Retention and garbage collection

| Data | Retention | Mechanism |
|---|---|---|
| Orphan attachments (`owner_id IS NULL`) | 24 h | `files.gc_orphans` (LED-01 EC-6) |
| Attachments of a soft-deleted owner | 30 days, then storage GC | `files.gc_orphans` second pass |
| `export_file` | 7 days (`reports_export.expires_at`) | `platform.purge_jobs` companion sweep |
| `import_file` | 90 days | same |
| Everything else | Life of the tenant; deleted by `platform.delete_tenant` after the PLT-10 cool-off | |

Deleting an attachment row and deleting its bytes are **two steps in two transactions**: the row is soft-deleted first, and the bytes are removed by the GC job after 30 days. A crash between them leaves an orphan file, which the GC finds by walking the tenant's directory and diffing against `storage_key`s — never the other way round, because deleting bytes for a row that still exists is unrecoverable.

### 20.9.6 The migration path to object storage

Every call site uses `django.core.files.storage.default_storage` (or a model `FileField` with the same backend) and the `storage_key` string. Nothing in the codebase constructs a filesystem path, opens a file by absolute path, or assumes the bytes are local. Therefore Phase 2 is:

```python
# config/settings/prod.py — the entire change
STORAGES = {
    "default": {
        "BACKEND": env.str("UB_STORAGE_BACKEND",
                           "django.core.files.storage.FileSystemStorage"),
        "OPTIONS": json.loads(env.str("UB_STORAGE_OPTIONS", "{}")),
    },
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
```

plus adding the storage package to `requirements` under a new ADR. Two call sites need a conditional and are written that way from day one: `X-Accel-Redirect` becomes a signed redirect when the backend is remote, and the GC directory walk becomes a bucket listing. Both are isolated in `apps/files/services/serve.py` and `apps/files/tasks.py`, and both are marked with a `# storage-backend seam` comment.

---

## 20.10 Integrations as adapters

**The rule, absolute:** no view, serializer, selector or model ever calls a provider. Only a service calls an adapter, and only through an interface declared in `apps/common/integrations/`. This is what keeps ADR-015 and ADR-016 honest — at MVP the "providers" are a logger and a URL builder, and the code that will talk to MSG91 or the WhatsApp Cloud API in Phase 2 already exists in shape.

### 20.10.1 SMS

```python
# apps/common/integrations/sms/base.py
from typing import Protocol


@dataclass(frozen=True, slots=True)
class SmsMessage:
    to: str                    # E.164
    body: str
    template_code: str
    dlt_template_id: str | None = None
    sender_id: str | None = None


@dataclass(frozen=True, slots=True)
class SmsResult:
    status: str                # "sent" | "failed" | "skipped"  (canon §0.7 MessageLog statuses)
    provider: str
    provider_message_id: str | None = None
    error: str | None = None
    cost: Decimal | None = None


class SmsBackend(Protocol):
    name: str

    def send(self, message: SmsMessage) -> SmsResult: ...
```

```python
# apps/common/integrations/sms/console.py
class ConsoleSmsBackend:
    """MVP backend (ADR-015). Writes the message to the log and reports `sent`.

    `sent` rather than `skipped` because the development flow must exercise the
    same state machine as production. A backend that is not configured at all is
    NullSmsBackend, which reports `skipped` — canon §0.7's meaning of the word.
    """

    name = "console"

    def send(self, message: SmsMessage) -> SmsResult:
        logging.getLogger("ub.sms").info(
            "sms.console", extra={"to": mask_mobile(message.to),
                                  "template": message.template_code, "body": message.body}
        )
        return SmsResult(status="sent", provider=self.name,
                         provider_message_id=f"console-{uuid6.uuid7().hex[:16]}")
```

Selection is a settings string resolved once, at startup:

```python
# config/settings/base.py
SMS_BACKEND = env.str("UB_SMS_BACKEND", "apps.common.integrations.sms.console.ConsoleSmsBackend")
```

```python
# apps/common/integrations/sms/__init__.py
@lru_cache(maxsize=1)
def get_sms_backend() -> SmsBackend:
    return import_string(settings.SMS_BACKEND)()
```

The **service** (`notifications/services/send.py`) does everything that is not provider-specific: resolve the template (tenant → partner → global, Part 21 §21.3.2), render placeholders, check party consent and tenant settings, enforce DLT constraints, write the `notifications_message_log` row *before* calling the backend (`status='queued'`), call `backend.send()`, then update the row with the result. Writing the log first means a crash mid-send leaves evidence; it also means the message log is the place to look for "did we try", which Part 30 §30.5 relies on.

Phase 2 adds `apps/common/integrations/sms/msg91.py` implementing the same protocol. No caller changes. Provider webhooks for delivery receipts land on a new endpoint that updates `notifications_message_log.status` by `provider_message_id` — which is why that column is indexed today.

### 20.10.2 WhatsApp

```python
# apps/common/integrations/whatsapp/base.py
class WhatsAppBackend(Protocol):
    name: str
    is_automated: bool          # False for deep links: a human must tap Send

    def build(self, *, to: str, body: str, template_code: str,
              variables: dict) -> WhatsAppOutcome: ...
```

```python
# apps/common/integrations/whatsapp/deep_link.py
class WaMeBackend:
    """MVP (ADR-015): produce a wa.me URL for the user to tap. Nothing is sent."""

    name, is_automated = "wa_me", False

    def build(self, *, to, body, template_code, variables) -> WhatsAppOutcome:
        digits = re.sub(r"\D", "", to)          # wa.me wants digits, no '+'
        url = f"https://wa.me/{digits}?text={quote(body, safe='')}"
        return WhatsAppOutcome(url=url, text=body, status="sent", provider=self.name)
```

The distinction that matters for the API contract is `is_automated`: LED-06 specifies that `POST /reminders/{id}/send` returns `{wa_url, text}` and marks the reminder `sent` for `whatsapp_manual`, but returns 202 and a `message_log` id for automated channels. The view branches on `backend.is_automated`, not on a hard-coded channel name, so switching a tenant to the Cloud API in Phase 2 changes behaviour correctly without touching the view.

### 20.10.3 UPI intent and QR

ADR-016: generated locally, no aggregator, no network.

```python
# apps/common/integrations/upi/intent.py
def build_upi_url(*, vpa: str, payee_name: str, amount: Decimal | None = None,
                  note: str | None = None, ref: str | None = None) -> str:
    """NPCI UPI deep link. Every value is percent-encoded; `am` is always 2 dp.

    upi://pay?pa=<vpa>&pn=<name>&am=<amount>&cu=INR&tn=<note>&tr=<ref>
    """
    if not VPA_RE.match(vpa):
        raise ValidationFailed({"upi_vpa": ["Enter a valid UPI ID, e.g. name@bank"]})
    params = {"pa": vpa, "pn": payee_name[:50], "cu": "INR"}
    if amount is not None:
        params["am"] = str(q2(amount))
    if note:
        params["tn"] = re.sub(r"[^\w .\-]", "", note)[:50]   # NPCI: alphanumeric-ish only
    if ref:
        params["tr"] = re.sub(r"[^\w-]", "", ref)[:35]
    return "upi://pay?" + urlencode(params, quote_via=quote)
```

The QR is an SVG produced by a small vendored QR encoder in `apps/common/integrations/upi/qr.py` (byte mode, error-correction level M, no external dependency, ~200 lines, unit-tested against known-good fixtures for three payloads). It returns an SVG string; the endpoint `GET /payments/qr.svg` serves it with `Content-Type: image/svg+xml`, `Cache-Control: private, max-age=300`. Nothing about QR generation touches the network, and nothing stores the generated image.

### 20.10.4 The Phase-2 payment-aggregator adapter shape

Written down now so the seam is real rather than aspirational:

```python
# apps/common/integrations/payments/base.py  (Phase 2 — the interface is defined at MVP)
class PaymentAggregatorBackend(Protocol):
    name: str

    def create_order(self, *, amount: Decimal, reference: str,
                     metadata: dict) -> AggregatorOrder: ...
    def verify_webhook(self, *, raw_body: bytes, headers: Mapping[str, str]) -> WebhookEvent: ...
    def fetch_payment(self, *, provider_payment_id: str) -> AggregatorPayment: ...
```

The MVP obligations that make this possible later, and which must be built now: `payments_request` exists in the schema with `provider`, `provider_order_id`, `provider_payment_id` and `U(provider, provider_payment_id) WHERE NOT NULL` (idempotent webhooks); `payments_payment.payment_request_id` exists; the allocation service already accepts a payment created by something other than a user.

### 20.10.5 Testing adapters

Every backend has a `Fake*` sibling in `apps/common/integrations/<x>/fakes.py` that records calls in memory. Tests set `settings.SMS_BACKEND = "…fakes.FakeSmsBackend"` and assert on `fake.sent`. No test ever monkeypatches `requests`, because at MVP nothing imports `requests`.

---

## 20.11 Data integrity

### 20.11.1 Transaction boundaries

**One HTTP request that changes state = one database transaction.** The transaction is opened by the **service**, never by the view and never by `ATOMIC_REQUESTS`.

`ATOMIC_REQUESTS = False` is deliberate. Wrapping the whole request would mean an audit row could not be written for a request that fails validation late, would hold locks across serialization work, and would make `transaction.on_commit` fire after the response is rendered rather than after the business change. Explicit `@transaction.atomic` on the service keeps the boundary exactly around the work that must be all-or-nothing.

Rules:

1. A service that writes declares `@transaction.atomic` (or uses the context manager for a narrower scope).
2. A service that calls another writing service does **not** open a nested transaction expecting isolation — Django's nested `atomic()` creates a savepoint, which rolls back to the savepoint, not to the start. Where a nested failure must not kill the outer work (rare, and enumerated: the low-stock notification), the inner call is wrapped in its own `atomic()` and its exception is caught explicitly.
3. **No network call, no file write, no sleep inside a transaction.** SMS goes through `enqueue()`; image processing happens before the transaction opens; file bytes are written before the attachment row is created.
4. `transaction.on_commit` is used only for effects that are safe to lose.
5. A job handler opens its own transaction; the runner's bookkeeping updates are outside it.

### 20.11.2 `select_for_update` and lock ordering

Deadlocks come from two transactions taking the same locks in different orders. The product therefore fixes a **global lock order** and every service obeys it:

> **L0 — Global order.** `platform_tenant` → `parties_party` → `sales_document` / `purchases_document` (by `document_date, number`) → `payments_payment` → `inventory_item_stock` (by `item_id`) → `platform_document_sequence` → `ledger_entry` → everything else.

`platform_document_sequence` sits **late** in this order, and that is the whole of the resolution to the issue-path inversion (Part 41 BE-05). The sequence row is the hottest lock in the product — one row per `(tenant, kind, fy_label)`, contended by every concurrent issue — and every transaction that takes it holds it until commit. Placing it after the stock locks means it is taken at the end of the issue, once everything that can fail has already failed, so it is held for the shortest span the design allows. An earlier draft put it second in L0 and then overrode that in rule L4 with a parenthetical; the order itself is amended here instead, and `SAL-02` BR-16 is amended to match, so the two documents state one order rather than out-voting each other.

| Rule | Statement |
|---|---|
| **L1** | Lock the **party** before inserting or updating any `ledger_entry` for it. (`post_entry`, `reverse_entry`, `correct_entry`.) |
| **L2** | When locking several `inventory_item_stock` rows, lock them **ordered by `item_id`**. A document with lines in arbitrary order must sort before locking: `sorted(lines, key=lambda l: str(l.item_id))`. |
| **L3** | When allocating a payment across several documents, lock them **ordered by `(document_date, number, id)`** — the same order FIFO visits them. |
| **L4** | The document sequence is locked **last of the contended locks** — after the party, document, payment and `inventory_item_stock` locks and immediately before the number is written — and is released only by commit. The issue path is therefore: unlocked pre-check → party lock → stock locks (ordered by `item_id`, rule L2) → **authoritative stock check and movements under those locks** → sequence lock → allocate number → ledger → commit. `SAL-02` BR-16 states the same sequence; where the two differ, this rule governs the *lock order* and BR-16 governs the *behaviour*. |
| **L4a** | `check_availability` before the party lock is an **unlocked pre-check**. Its only purpose is to fail fast with a per-line `insufficient_stock` error before anything is written; its result is advisory and may be stale. The **decisive** availability check is the one `post_movements` performs while holding the `inventory_item_stock` rows `FOR UPDATE`, and it is that check — not the pre-check — that `test_concurrent_issue_same_stock` proves. Reading the pre-check as authoritative is what would permit the over-issue the test forbids. |
| **L5** | Never take a lock inside a loop that also performs I/O. |
| **L6** | `select_for_update(nowait=False, skip_locked=False)` everywhere except the job claim, which is the sole `skip_locked=True` user. |

`lock_timeout` is set per connection to **5 seconds** (`options` in `DATABASES`), so a pathological lock wait fails fast with a clear error instead of consuming a worker. A `DatabaseError` from a lock timeout maps to `503 service_busy` with `Retry-After: 1`.

### 20.11.3 Constraints versus validation

| Kind of rule | Where it lives | Why |
|---|---|---|
| Shape (type, length, required, enum membership) | Serializer **and** model field/`TextChoices` | The user needs a field-level message; the database needs a guarantee. |
| Simple row invariants (`amount > 0`, `qty <> 0`, reversal has `reverses_id`, valid enum) | **Database `CHECK`**, plus a service check that raises a friendly error | A `CHECK` cannot be bypassed by a management command, a data migration or a future bug. |
| Uniqueness (party mobile per tenant, SKU, one opening per party, document number per FY, one allocation per payment-document pair) | **Partial unique index** + a service pre-check for the message | Race conditions are only closed by the index; the pre-check exists to produce a good error 99.9 % of the time. |
| Cross-row invariants (`Σ allocations ≤ grand_total`, balance equals ledger sum) | **Service, under locks**, plus `check_invariants` | Not expressible as a constraint without triggers the product does not want. |
| Append-only | **Trigger** `forbid_update_delete` + no code path | Defence in depth: this is the invariant whose violation is unrecoverable. |

**The triggers.** Installed by migration on `ledger_entry` and `inventory_stock_movement`:

```sql
CREATE OR REPLACE FUNCTION forbid_update_delete() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'append_only_violation: % rows cannot be deleted', TG_TABLE_NAME
            USING ERRCODE = 'restrict_violation';
    END IF;
    -- ledger_entry permits exactly two mutable columns (Part 21 §21.3.4).
    IF TG_TABLE_NAME = 'ledger_entry' THEN
        IF ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN
            IF (NEW.id, NEW.tenant_id, NEW.party_id, NEW.direction, NEW.amount, NEW.entry_date,
                NEW.entry_type, NEW.source_type, NEW.source_id, NEW.note, NEW.payment_mode,
                NEW.reference, NEW.reverses_id, NEW.supersedes_id, NEW.reason, NEW.created_at)
               IS DISTINCT FROM
               (OLD.id, OLD.tenant_id, OLD.party_id, OLD.direction, OLD.amount, OLD.entry_date,
                OLD.entry_type, OLD.source_type, OLD.source_id, OLD.note, OLD.payment_mode,
                OLD.reference, OLD.reverses_id, OLD.supersedes_id, OLD.reason, OLD.created_at)
            THEN
                RAISE EXCEPTION 'append_only_violation: only status and reversed_by_id may change'
                    USING ERRCODE = 'restrict_violation';
            END IF;
        END IF;
        RETURN NEW;
    END IF;
    -- inventory_stock_movement has no mutable columns at all.
    RAISE EXCEPTION 'append_only_violation: % rows are immutable', TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ledger_entry_append_only
    BEFORE UPDATE OR DELETE ON ledger_entry
    FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

CREATE TRIGGER trg_stock_movement_append_only
    BEFORE UPDATE OR DELETE ON inventory_stock_movement
    FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
```

The trigger is exercised by tests T-LED-01-7 and T-LED-03-8 (raw SQL `UPDATE ledger_entry SET amount = …` must raise; `UPDATE … SET status = 'reversed'` must succeed). Tenant deletion (PLT-10) must therefore `ALTER TABLE … DISABLE TRIGGER` inside its own transaction, which the deletion job does explicitly and audibly — the only place that is permitted.

### 20.11.4 The constraint inventory that enforces the invariants

| Invariant | Enforcement |
|---|---|
| Every business row belongs to a tenant | `tenant_id NOT NULL` on every business table; FK `ON DELETE RESTRICT` |
| Ledger amount positive | `CHECK (amount > 0)` |
| Stock movement non-zero | `CHECK (qty <> 0)` |
| One opening entry per party | `UNIQUE (party_id) WHERE entry_type='opening' AND status='posted'` |
| Document number unique per tenant/kind/FY | `UNIQUE (tenant_id, kind, fy_label, number)` |
| One document sequence per tenant/kind/FY | `UNIQUE (tenant_id, kind, fy_label)` |
| Party mobile unique per tenant | `UNIQUE (tenant_id, mobile) WHERE mobile IS NOT NULL AND deleted_at IS NULL` |
| Item SKU / barcode unique per tenant | `UNIQUE (tenant_id, sku) WHERE deleted_at IS NULL`; same for barcode `WHERE barcode IS NOT NULL` |
| One supplier invoice number per supplier | `UNIQUE (tenant_id, party_id, supplier_invoice_number) WHERE supplier_invoice_number IS NOT NULL AND status <> 'void'` |
| One allocation per payment × document | `UNIQUE (payment_id, document_type, document_id)`, `CHECK (amount > 0)` |
| Item stock row unique per item/variant/location | `UNIQUE (item_id, variant_id, location_id)` |
| One auto reminder per party/date/kind | `UNIQUE (party_id, due_on, kind) WHERE kind IN ('auto_d1','auto_d0')` |
| Idempotency key unique per tenant/scope | `UNIQUE (tenant_id, scope, key)` |
| One live job per dedupe token | `UNIQUE (tenant_id, job_type, idempotency_token) WHERE …` |
| Round-off bounded | `CHECK (round_off >= -0.50 AND round_off <= 0.50)` |
| Document totals coherent | *not* a constraint — asserted by the service and by `check_invariants` (§20.11.5) |

### 20.11.5 Recalculation commands and how they are proven correct

Three commands, all idempotent, all safe to run on production, all read-committed and chunked:

| Command | Recomputes | Proof |
|---|---|---|
| `recalc_balances [--tenant …] [--party …] [--fix]` | `parties_party.balance/receivable_total/payable_total` from `ledger_entry` | Without `--fix` it reports drift and exits non-zero if any exists. LED-01 T-11: 10 000 random entries → zero drift. |
| `recalc_stock [--tenant …] [--item …] [--fix]` | `inventory_item_stock.on_hand/avg_cost` **and** each movement's `on_hand_after`/`avg_cost_after`, by replaying the log in canonical order (`recompute_item_cost`, §20.6.2) | Property test: a random sequence of 500 movements — **including backdated inbounds interleaved between outbounds, and a void** — replayed equals the incrementally maintained cache to the paisa (Part 28 §28.2.5). |
| `check_invariants [--tenant …]` | Read-only: reports every violation of the cross-row invariants below | Runs nightly as `platform.check_invariants` (§20.8.4); a non-empty report is an operator alert (Part 30 §30.10). Never writes. |

`check_invariants` asserts, per tenant, in SQL:

```sql
-- 1. Party balance equals the ledger.
SELECT p.id FROM parties_party p
JOIN (SELECT party_id,
             SUM(amount) FILTER (WHERE direction='debit'  AND status='posted')
           - SUM(amount) FILTER (WHERE direction='credit' AND status='posted') AS b
      FROM ledger_entry GROUP BY party_id) l ON l.party_id = p.id
WHERE p.balance <> COALESCE(l.b, 0);

-- 2. Item on-hand equals the sum of its movements.
SELECT s.item_id FROM inventory_item_stock s
JOIN (SELECT item_id, location_id, SUM(qty) q FROM inventory_stock_movement
      GROUP BY item_id, location_id) m
  ON m.item_id = s.item_id AND m.location_id = s.location_id
WHERE s.on_hand <> m.q;

-- 3. Document amount_paid equals its allocations plus applied credits.
SELECT d.id FROM sales_document d
LEFT JOIN (SELECT document_id, SUM(amount) a FROM payments_allocation
           WHERE document_type='sales_document' GROUP BY document_id) pa ON pa.document_id = d.id
LEFT JOIN (SELECT invoice_id, SUM(amount) a FROM sales_credit_application
           GROUP BY invoice_id) ca ON ca.invoice_id = d.id
WHERE d.status <> 'void'
  AND d.amount_paid <> COALESCE(pa.a, 0)
   OR d.amount_due  <> d.grand_total - COALESCE(pa.a,0) - COALESCE(ca.a,0);

-- 4. No allocation exceeds its document.
SELECT document_id FROM payments_allocation GROUP BY document_id, document_type
HAVING SUM(amount) > (SELECT grand_total FROM sales_document WHERE id = document_id);

-- 5. Every reversal has a reversed original, and vice versa.
SELECT id FROM ledger_entry WHERE entry_type='reversal' AND reverses_id IS NULL
UNION ALL
SELECT id FROM ledger_entry WHERE status='reversed' AND reversed_by_id IS NULL;

-- 6. Document numbers have no duplicates and the sequence is ahead of every number.
SELECT tenant_id, kind, fy_label, number FROM sales_document
WHERE number IS NOT NULL GROUP BY 1,2,3,4 HAVING COUNT(*) > 1;
```

**The nightly drift job, completely.** NFR-40 ("nightly recompute finds zero drift"), goal G3 and the Part 12 §12.5 launch gate all rest on one job. It is registered in §20.8.4 as `platform.check_invariants` (daily 02:45 IST, fanned out one child per active tenant per rule S3), with `parties.recalc_balances` (03:00) and `inventory.recalc_stock` (03:10) as its two full-replay companions. What it does, exactly:

| | |
|---|---|
| **What it compares** | The six SQL invariants above, which are set-based and cheap; plus, per `(item_id, location_id)`, the full canonical-order replay of Part 21 §21.3.6 (6) against (a) `inventory_item_stock.on_hand` and `avg_cost` and (b) every movement row's `on_hand_after` and `avg_cost_after`; plus, per party, the ledger sum against `parties_party.balance`. Rows with `cost_state = 'stale'` are excluded from the cost comparison and counted separately; one stale for more than fifteen minutes is itself a reported violation, because it means a recompute was enqueued and never ran. |
| **Runtime budget** | On the 100,000-movement / 60-party / 10,000-entry reference dataset (Part 12 §12.5, Part 28 §28.9.3): the SQL pass ≤ 30 s; the stock replay ≤ 5 min; balance replay ≤ 2 min; the whole nightly invariant window ≤ 10 min. The replay is one ordered index scan per `(item, location)` over `IX(tenant_id, item_id, location_id, movement_date, sequence_no)`, streamed at 2,000 rows a chunk, on the `jobs` connection alias with its raised `statement_timeout`. Exceeding the budget is a performance regression, not a correctness failure, and fails the Part 28 §28.9.1 performance gate. |
| **On finding drift** | **Report only. It never writes a correction, ever** — not to a cache, not to a movement row. Self-healing would erase the evidence of the bug that caused the drift, which is the only thing that makes the drift worth detecting. The job writes its findings to its own `platform_job.result` as `{"checked": {…}, "violations": [{"kind": "stock_avg_drift", "item_id": …, "cached": …, "replayed": …}], "duration_ms": …}` and exits successfully; a non-empty `violations` array is the signal, not a failed job. |
| **Where it is visible** | `GET /admin/jobs?job_type=platform.check_invariants` (the operator console, Part 22 §22.12); the `result` payload above; a `WARNING`-level log line `invariant.violated` per violation with the tenant, the kind and the two figures (Part 30 §30.4). |
| **The alert** | `invariant.violated` fires to the operator channel on any non-empty report (Part 30 §30.10), and `job.expected_run_missing` fires when the job itself did not run inside its grace window (§20.8.7, rule S4). The second matters as much as the first: before it existed, a nightly drift job that silently stopped running was indistinguishable from a night with no drift. |
| **The repair path** | An operator, having read the report, runs `recalc_stock --item … --fix` or `recalc_balances --party … --fix` by hand. The fix is deliberately a human action with a recorded reason, not an automatic one. |

### 20.11.6 The concurrency test plan

Concurrency bugs do not appear in single-threaded tests, so these are written with real threads against the real database (pytest-django with `TransactionTestCase` semantics, `--reuse-db` off for these):

| Test | Scenario | Assertion |
|---|---|---|
| `test_concurrent_entries_one_party` | 20 threads post entries to one party | Final balance equals the arithmetic sum; no lost update (LED-01 EC-7) |
| `test_concurrent_issue_sequence` | 10 threads issue invoices for one tenant | 10 distinct consecutive numbers, no gap, no duplicate (SAL-02 EC-7) |
| `test_concurrent_issue_same_stock` | 5 threads issue invoices consuming the same item with 3 on hand | Exactly 3 succeed (or as stock permits); the rest get `insufficient_stock`; `on_hand` never goes below 0 |
| `test_concurrent_reverse_same_entry` | 2 threads reverse one entry | One 201, one 409 `entry_already_reversed` (LED-03 EC-2) |
| `test_concurrent_allocation` | 2 payments allocate to one invoice with `amount_due = 100` | Total allocated ≤ 100; the loser gets `over_allocated` |
| `test_idempotent_double_submit` | 2 threads, same `Idempotency-Key`, same body | One executes, one replays or gets the in-progress 409; exactly one row created |
| `test_job_claim_disjoint` | 4 runners, 200 jobs | Each job executed exactly once; no runner blocks |
| `test_lock_order_no_deadlock` | 2 threads issuing documents with the same two items in opposite line order | No deadlock (rule L2 sorts before locking) |

---

## 20.12 Migrations and schema evolution

### 20.12.1 Naming and hygiene

Part 21 §21.8 fixes the policy; this section is how it is executed.

- **Naming:** `NNNN_<verb>_<entity>[_<detail>]` — `0007_add_credit_limit_to_party`, `0012_create_platform_job`, `0018_backfill_party_receivable_totals`. Django's auto-generated names (`0007_auto_20260918_1432`) are always renamed before commit.
- **One migration per PR per app.** If a PR needs three schema changes in one app, they are squashed into one migration before review.
- **Never edit a merged migration.** Fixing a mistake means a new migration. The only exception is a migration that has never left the author's machine.
- **Schema and data migrations are separate files.** A `RunPython` never appears in the same migration as an `AddField`, because the two need different review, different rollback and different locks.
- **Every `RunPython` is reversible or explicitly `migrations.RunPython.noop`.** A data migration with no reverse must say so in code, not by omission.
- **Data migrations must not import models.** They use `apps.get_model("app", "Model")` so the migration sees the historical schema, never today's Python class.

### 20.12.2 The backwards-compatible-change rule

The backend and the frontend deploy independently, and a `scheduler` container runs the previous image for the seconds around a deploy. Therefore **every migration must be safe against the previous version of the code running simultaneously**. This forbids, in one step:

| Forbidden in one step | Do instead |
|---|---|
| Drop a column | Stop writing it → deploy → drop in the next release |
| Rename a column | Add new → dual-write → backfill → switch reads → stop writing old → drop |
| Add a `NOT NULL` column without a default to a populated table | Add nullable → backfill in batches → `ALTER … SET NOT NULL` via `CHECK … NOT VALID` then `VALIDATE` |
| Change a column type in place | New column + backfill + switch (a `numeric` widening, e.g. `(14,2)` → `(16,2)`, is the one safe in-place change and still needs a lock window) |
| Add a unique index on a populated table without `CONCURRENTLY` | `AddIndexConcurrently` in an `atomic = False` migration |
| Add a foreign key with validation to a large table | `ALTER TABLE … ADD CONSTRAINT … NOT VALID`, then `VALIDATE CONSTRAINT` in a second migration |

The NOT NULL pattern, concretely:

```python
# 0031_add_place_of_supply_nullable.py
operations = [migrations.AddField("salesdocument", "place_of_supply_state",
                                  models.CharField(max_length=2, null=True))]

# 0032_backfill_place_of_supply.py  (data; batched; reversible as noop)
def backfill(apps, schema_editor):
    Doc = apps.get_model("sales", "SalesDocument")
    while True:
        ids = list(Doc.objects.filter(place_of_supply_state__isnull=True)
                   .values_list("pk", flat=True)[:2000])
        if not ids:
            break
        Doc.objects.filter(pk__in=ids).update(place_of_supply_state=F("party_snapshot__state_code"))

operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]

# 0033_enforce_place_of_supply_not_null.py
operations = [
    migrations.RunSQL(
        "ALTER TABLE sales_document ADD CONSTRAINT ck_pos_not_null "
        "CHECK (place_of_supply_state IS NOT NULL) NOT VALID;",
        reverse_sql="ALTER TABLE sales_document DROP CONSTRAINT ck_pos_not_null;"),
    migrations.RunSQL("ALTER TABLE sales_document VALIDATE CONSTRAINT ck_pos_not_null;",
                      reverse_sql=migrations.RunSQL.noop),
    migrations.AlterField("salesdocument", "place_of_supply_state",
                          models.CharField(max_length=2)),
]
```

### 20.12.3 Zero-downtime ordering

The deploy order is fixed: **migrate first, then roll the application.** Every migration must therefore be forward-compatible with the *old* code (which is what §20.12.2 guarantees). `docker/entrypoint.sh` runs `python manage.py migrate --noinput` before starting gunicorn, and the `scheduler` waits for the `backend` service, so migrations run exactly once even with several backend replicas (Postgres's migration advisory lock handles the race).

A migration that cannot be made backwards-compatible (there will be one eventually) is deployed as an announced maintenance window with the compose stack stopped — acceptable for a single-VPS product, and documented in the release notes rather than pretended away.

### 20.12.4 Known schema deltas this chapter introduces

Part 21 is the schema authority, and three things this architecture requires are not yet in it. They are listed here so the change requests are explicit rather than silently implemented:

| # | Change | Reason | Status |
|---|---|---|---|
| CR-BE-1 | **`platform_job`** table as specified in §20.8.2 | ADR-012's job abstraction has no storage definition in Part 21 | Specified here; Part 21 to absorb |
| CR-BE-2 | **`platform_idempotency_key`** table as specified in §20.6.5 | §22.1 mandates 24 h key storage; SAL-02 §15 flags the gap as CR-SAL-3 | Specified here; Part 21 to absorb |
| CR-BE-3 | **`sales_document.version` / `purchases_document.version`** `integer NOT NULL DEFAULT 1` | §22.1 and §22.7 require optimistic concurrency on mutable documents; Part 21 §21.3.7 omits the column (SAL-02 §15 CR-SAL-3) | Specified here; Part 21 to absorb |
| CR-BE-4 | **`platform_membership.permissions_version`** `integer NOT NULL DEFAULT 1` | The `ver` claim in §22.2 needs a stored counterpart (§20.5.1) | Specified here; Part 21 to absorb |
| CR-BE-5 | **`platform_user.token_epoch`** `integer NOT NULL DEFAULT 1` | Immediate global revocation without a Redis blocklist (§20.5.3) | Specified here; Part 21 to absorb |

Nothing else in this chapter adds a column.

### 20.12.5 Seeds and fixtures for a fresh install

Seeds are **idempotent management commands**, not migrations (Part 21 §21.8), with the single exception of the four system role rows, which a constraint depends on and which are therefore created in `platform/migrations/0002_system_roles.py`.

```
python manage.py seed_reference_data     # safe to run any number of times
  ├─ tax rates            GST0, GST0_25, GST3, GST5, GST18, GST40, EXEMPT, NIL, NONGST
  │                       + historical GST12 / GST28 with effective_to = 2025-09-21
  ├─ units (UQC)          NOS, KGS, GMS, LTR, MLT, MTR, BOX, PCS, PKT, DOZ, BAG, BTL, SET, …
  ├─ expense categories   Rent, Salaries, Electricity, Transport, Purchases-misc, Food,
  │                       Marketing, Fees, Other
  ├─ HSN master           bulk-loaded from data/hsn.csv (≈ 20k rows) with COPY, skipped if present
  ├─ default partner      code="metis", name="Metis Labs"
  ├─ default plans        free / growth / pro with `modules` and `limits`
  └─ notification templates  LEDGER_ENTRY_GAVE/GOT/CORRECTED/REVERSED, REMINDER_DUE,
                             OTP_LOGIN, INVITE — en + hi
```

```
python manage.py seed_demo_tenant --mobile +919999900001
  # A complete, believable shop for local development and for demos:
  #   1 tenant (regular GST, Maharashtra), 1 owner + 1 staff + 1 accountant
  #   40 parties with realistic balances and collection dates
  #   60 items across 6 categories with opening stock
  #   ~400 ledger entries over 6 months, 25 invoices, 8 credit notes,
  #   30 payments (some partial), 20 expenses, 12 reminders
  # Deterministic: seeded RNG, fixed dates relative to today, so screenshots and
  # E2E tests are stable. Refuses to run when DEBUG is False.
```

pytest fixtures never call the seed commands (too slow); they use `factory-boy` factories in `tests/factories/`, one module per app, with a `TenantFactory` that wires partner, plan, tenant, roles and an owner membership in one call. The two-tenant fixture used by every isolation test (§20.4.7) is built from those factories.

---

## 20.13 Configuration and environments

### 20.13.1 Settings layering

```
config/settings/base.py     ← everything, reading env with sane defaults
        ├── local.py        ← from .base import *   (DEBUG, console SMS, toolbar, loose CORS)
        ├── test.py         ← from .base import *   (fast hasher, eager jobs, temp media)
        ├── staging.py      ← from .prod import *   (prod posture, staging hosts and keys)
        └── prod.py         ← from .base import *   (DEBUG False, secure cookies, file logs)
```

Rules: `base.py` never branches on `DEBUG`; each environment file only *overrides*. The four module names — `config.settings.{local,staging,prod,test}` — are the only spellings permitted anywhere in the corpus (Part 29 §29.2.4). `DJANGO_SETTINGS_MODULE` defaults to `config.settings.local` in `manage.py` and is set explicitly to `config.settings.prod` in the Dockerfile. A production process that boots with `DEBUG=True` must fail: `prod.py` asserts `not DEBUG` and asserts that `UB_SECRET_KEY`, `UB_ALLOWED_HOSTS` and `POSTGRES_PASSWORD` are not their development defaults.

Environment reading uses `environs` (ADR-021 admits `python-decouple/environs`):

```python
# config/settings/base.py (head)
from environs import Env

env = Env()
env.read_env()          # .env in dev; real environment in Docker

SECRET_KEY = env.str("UB_SECRET_KEY", "dev-insecure-change-me")
DEBUG = env.bool("UB_DEBUG", False)
ALLOWED_HOSTS = env.list("UB_ALLOWED_HOSTS", ["localhost", "127.0.0.1", "backend"])
```

### 20.13.2 The environment-variable catalogue

**The catalogue lives in Part 29 §29.2.4 and only there** (Part 0 §0.12; Part 42 CF-13 assigns it to the operator's chapter). This chapter previously carried a second, disjoint catalogue; the two used different prefixes for the same variables and each asserted it was complete, and the settings test was bound to one of them (Part 41 BA-07). It is deleted rather than reconciled in place.

What this chapter is responsible for is unchanged and is stated here:

- **The convention.** Every variable the application reads is prefixed `UB_`; variables a third-party image requires by name (`POSTGRES_*`, `PG_*`, `GUNICORN_*`, `NEXT_PUBLIC_*`, `DJANGO_SETTINGS_MODULE`, `BACKUP_*`) are not. The Django *setting* keeps its ordinary Django name: `UB_MEDIA_ROOT` sets `MEDIA_ROOT`.
- **Nothing outside the catalogue may be read.** A startup check in `apps/common/apps.py: CommonConfig.ready` compares the `UB_`-prefixed keys of `os.environ` against the Part 29 §29.2.4 table and logs a warning for any it does not recognise — a typo'd variable is otherwise silent and deadly. The converse direction, "every variable a settings module reads appears in the catalogue", is asserted by the settings test (Part 28 §28.3.9), which parses the settings modules with `ast` and diffs against that one table.
- **Adding a variable** is therefore two edits: the settings module, and the Part 29 catalogue. A pull request that adds one without the other fails the settings test.

### 20.13.3 Secret handling locally

`.env` is git-ignored; `.env.example` is committed with development-safe defaults. No secret is ever committed, including "temporary" ones — a leaked key in history is a leaked key forever. Locally, secrets are the defaults above and nothing more sensitive exists, because the only external systems at MVP are the database (in the same compose stack) and nothing else. On the single-VPS production host, `.env` is root-owned `0600`, created by the deploy runbook, and referenced by `env_file:` in compose. Phase 2 moves to the partner's secret manager, which is a change to how `.env` is produced, not to how the app reads it.

`SECRET_KEY` rotation procedure: set `UB_SECRET_KEY_FALLBACKS` (Django 5's `SECRET_KEY_FALLBACKS`) to the old key, deploy, wait for the refresh-token lifetime, remove. This is in the runbook rather than a code concern.

### 20.13.4 `base.py`, the parts that matter

```python
# config/settings/base.py (excerpt)
INSTALLED_APPS = [
    "django.contrib.contenttypes", "django.contrib.auth", "django.contrib.staticfiles",
    "django.contrib.sessions", "django.contrib.messages", "django.contrib.admin",
    "rest_framework", "django_filters", "corsheaders",
    "apps.common", "apps.platform_app", "apps.tax", "apps.files", "apps.parties",
    "apps.ledger", "apps.inventory", "apps.sales", "apps.purchases", "apps.payments",
    "apps.expenses", "apps.notifications", "apps.imports", "apps.reports", "apps.help",
]

AUTH_USER_MODEL = "platform.User"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env.str("POSTGRES_DB"), "USER": env.str("POSTGRES_USER"),
        "PASSWORD": env.str("POSTGRES_PASSWORD"), "HOST": env.str("POSTGRES_HOST", "db"),
        "PORT": env.int("POSTGRES_PORT", 5432),
        "CONN_MAX_AGE": env.int("UB_DB_CONN_MAX_AGE", 60),
        "CONN_HEALTH_CHECKS": True,
        "OPTIONS": {
            "options": (
                f"-c statement_timeout={env.int('UB_DB_STATEMENT_TIMEOUT_MS', 15000)} "
                f"-c lock_timeout={env.int('UB_DB_LOCK_TIMEOUT_MS', 5000)} "
                f"-c idle_in_transaction_session_timeout=30000"
            ),
        },
    }
}

USE_TZ = True
TIME_ZONE = "UTC"                       # storage is UTC; tenant timezone is applied in selectors
LANGUAGE_CODE = "en"
LANGUAGES = [("en", "English"), ("hi", "हिन्दी")]
LOCALE_PATHS = [BASE_DIR / "locale"]

# ADR-021 allow-list + uuid6 (required by ADR-009's uuid7 primary keys).
# uuid6 is a ~200-line pure-Python module with no transitive dependencies; it is
# recorded here as the single addition to the backend list and carries ADR-021a.

CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
# Per-process, per-container memory only. There is no shared cache at MVP (no Redis,
# ADR-012): anything that must be shared is a table. LocMemCache exists so DRF
# throttling and django's own machinery have somewhere to write; throttle counters
# are therefore per-process, which is accepted at single-container scale and is
# documented in Part 27 §27.11.

ATOMIC_REQUESTS = False                 # §20.11.1
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"   # unused; every model declares a UUID pk
DATA_UPLOAD_MAX_MEMORY_SIZE = 12 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 2 * 1024 * 1024
```

`prod.py` adds: `SECURE_SSL_REDIRECT`, `SECURE_HSTS_SECONDS = 31536000` with preload and subdomains, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, `SECURE_PROXY_SSL_HEADER`, `SECURE_CONTENT_TYPE_NOSNIFF`, `X_FRAME_OPTIONS = "DENY"`, `SECURE_REFERRER_POLICY = "same-origin"`, the rotating file log handler, and the startup assertions.

### 20.13.5 The `Dockerfile` and entrypoint

```dockerfile
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DJANGO_SETTINGS_MODULE=config.settings.prod
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 libjpeg62-turbo zlib1g cron curl && rm -rf /var/lib/apt/lists/*
COPY requirements/ requirements/
RUN pip install --no-cache-dir -r requirements/prod.txt
COPY . .
RUN python manage.py collectstatic --noinput
RUN useradd --uid 10001 --no-create-home app && chown -R app /app/media /app/logs
USER app
EXPOSE 8000
ENTRYPOINT ["docker/entrypoint.sh"]
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3"]
```

`entrypoint.sh` waits for the database (`pg_isready` loop, 60 s cap) and then `exec "$@"`. That is all it does.

**It does not run `migrate`, and it does not run `seed_reference_data`** (the command Part 29's `seed_all` deploy step invokes). Migrations and seeds are explicit, ordered deploy steps, and **Part 29 owns their position in the sequence** (§29.5.2, §29.6.2: build → migrate → seed → restart backend → restart scheduler → restart frontend; Part 0 §0.12 assigns migration execution to Part 29). This chapter previously specified the opposite — migrate-on-start, defended by Postgres's migration advisory lock — and since the entrypoint is the thing that actually exists in the image, the entrypoint is what has been changed (Part 41 BE-08). Three reasons, from Part 29 §29.5.2: two containers starting concurrently both attempt `migrate`; a failed migration must stop the deploy with a clear error rather than produce a crash-looping container that masks the cause; and the old code must run against the new schema for the seconds between migrate and restart, which is the zero-downtime rule itself.

A consequence worth stating plainly: **a fresh container started against an unmigrated database will fail its health check**, and that is the intended behaviour. Local development runs `make migrate` (or `docker compose run --rm backend python manage.py migrate`) as its own step, exactly as production does; `§29.4.1`'s first-run script does it once.

---

## 20.14 Performance

### 20.14.1 The query budget

**Every list endpoint must serve a page with a bounded, constant number of queries, independent of page size.** The budget is declared per endpoint and asserted in a test; exceeding it fails CI.

| Endpoint | Budget | Composition |
|---|---|---|
| `GET /parties` | 4 | count, page, tags prefetch, `meta.totals` aggregate |
| `GET /parties/{id}` | 5 | party, summary aggregate, recent entries, tags, open-invoice count |
| `GET /parties/{id}/ledger-entries` | 3 | page (cursor, no count), attachments prefetch, created_by prefetch |
| `POST /ledger-entries` | 8 | party `FOR UPDATE`, setting, opening check (only when applicable), insert, party update, audit insert, job insert, idempotency insert/update |
| `GET /sales/invoices` | 5 | count, page, party join (select_related), lines prefetch (only with `include=lines`), totals aggregate |
| `GET /sales/invoices/{id}` | 6 | document, lines, party, payments, allocations, attachments |
| `POST /sales/invoices?issue=true` | ≤ 22 | sequence lock, tenant settings, N item locks collapsed into one `IN` query, stock cache updates (one `UPDATE … WHERE id IN`), movements `bulk_create`, document + lines, ledger, payment, allocations, caches, audits |
| `GET /reports/dashboard` | ≤ 8 | tiles from `reports_snapshot` when fresh; otherwise the direct aggregates |
| Any endpoint | **never O(page_size)** | |

```python
# tests/…/test_query_counts.py — the shape every app repeats
@pytest.mark.django_db
def test_party_list_query_budget(api_client, tenant_with_parties):
    PartyFactory.create_batch(50, tenant=tenant_with_parties)
    client = api_client(tenant_with_parties.owner)
    with django_assert_num_queries(4):
        client.get(reverse("v1:party-list") + "?page_size=50")
    # And prove it does not scale with the page:
    PartyFactory.create_batch(50, tenant=tenant_with_parties)
    with django_assert_num_queries(4):
        client.get(reverse("v1:party-list") + "?page_size=100")
```

The second half is the important half: a fixed count at one page size can still hide an N+1 that happens to be N=1.

### 20.14.2 `select_related` / `prefetch_related` policy

- **The selector owns the joins, not the serializer.** A serializer that needs `entry.created_by.full_name` does not fetch it; `list_entries()` declares `select_related("created_by")`. This is why serializers are forbidden from querying in `to_representation` (§20.3.1): the rule makes the N+1 impossible rather than merely discouraged.
- `select_related` for forward `ForeignKey`/`OneToOne`: `document.party`, `entry.created_by`, `line.item`, `item.unit`, `item.category`.
- `prefetch_related` for reverse and many-to-many: `document.lines`, `party.tags`, `payment.allocations`, and `Prefetch(...)` with an explicit inner queryset whenever the inner set needs its own ordering or filtering (`Prefetch("lines", queryset=SalesDocumentLine.objects.order_by("line_no"))`).
- `only()` / `defer()` are used **only** on the hot list paths where a wide row is measurably expensive (`sales_document` has ~45 columns; the list serializer needs 14). Everywhere else they are banned, because a deferred field fetched later is a per-row query — the exact bug the policy exists to prevent.
- `.iterator(chunk_size=…)` for anything that walks a whole tenant's history (recalc commands, exports, `check_invariants`).
- `values()`/`values_list()` for report projections that never become model instances.

### 20.14.3 Pagination defaults

| Style | Where | Defaults |
|---|---|---|
| Page | Everything by default | `page_size=25`, max 100; `meta: {page, page_size, total, total_pages}` |
| Cursor | Ledger entries, stock movements, notifications, audit logs | `limit=50`, max 200; `meta: {next_cursor, has_more}`; **no count query** |

Cursor pagination is keyset-based on `(entry_date DESC, created_at DESC, id DESC)` — never `OFFSET`, which degrades linearly and is why the ledger timeline uses a cursor at all. The cursor is an opaque base64 of the tuple plus a signature so it cannot be tampered into a different tenant's range (it is validated against the scoped queryset regardless, so tampering yields nothing, but signing removes the question).

`meta.totals` on list endpoints (parties, invoices) is computed over the **filtered set** with a separate aggregate query, not over the page. That is one extra query and it is in the budget.

### 20.14.4 The indexes that matter most

Part 21 §21.4 lists the access patterns; these are the ones whose absence would be immediately visible at 100 k rows:

| Index | Serves |
|---|---|
| `ledger_entry (tenant_id, party_id, entry_date, created_at)` | The party statement and the timeline cursor — the single hottest read in the product |
| `parties_party (tenant_id, status, last_activity_at DESC)` | The default party list ordering |
| `parties_party` GIN trigram on `name` | `?q=` search without a leading-wildcard table scan |
| `sales_document (tenant_id, kind, status, document_date DESC)` | The invoice list |
| `sales_document (tenant_id, due_on) WHERE status IN ('issued','partially_paid')` | The nightly overdue refresh and the aging report |
| `inventory_stock_movement (tenant_id, item_id, location_id, movement_date, sequence_no)` | Movement history and the canonical-order replay (§20.6.2) |
| `platform_job (priority, run_after, created_at) WHERE status='queued'` | The claim query — without it, every tick scans the table |
| `platform_audit_log (tenant_id, created_at DESC)` | Audit browsing |
| `payments_allocation (document_type, document_id)` | Document `amount_paid` recomputation |

Every one of these is declared in a model `Meta.indexes` with an explicit `name=` so it can be found, dropped and recreated by name.

### 20.14.5 Caching policy

**There is no cache at MVP beyond the cache *tables*.** No Redis (ADR-012), so no shared cache exists; `LocMemCache` is per-process and is used only by DRF throttling. The denormalised tables — `parties_party.balance`, `inventory_item_stock`, `sales_document.amount_paid/amount_due`, `reports_snapshot` — are the caching strategy, and they are durable, shared, transactional and recomputable, which a memory cache is not.

`reports_snapshot` is refreshed by the hourly `reports.refresh_snapshots` job for tenants above a size threshold; below it, the dashboard queries directly, because for a tenant with 300 ledger entries the aggregate is faster than the snapshot lookup. The threshold (`5 000` ledger entries, per Part 21 §21.4) is a setting, not a constant.

HTTP caching: `GET /parties/{id}/statement.pdf` and public document fetches set `Cache-Control: private, max-age=600`; everything else sets `Cache-Control: no-store`, because a shared browser on a shop counter must not leak the previous user's data from the back button.

### 20.14.6 Load targets

| Target | Value | Rationale |
|---|---|---|
| `POST /ledger-entries` P95 server time | ≤ 250 ms | LED-01 §5 |
| `POST /ledger-entries/{id}/correct` P95 | ≤ 300 ms | LED-03 §5 |
| `POST /sales/invoices?issue=true` P95 | ≤ 800 ms | Twelve ordered side effects (SAL-02 BR-16) |
| Any list endpoint P95 | ≤ 400 ms at 100 k rows for the tenant | Part 21 §21.4 performance fixture |
| `GET /reports/dashboard` P95 | ≤ 600 ms | Snapshot-backed |
| Concurrent tenants on one 4 vCPU / 8 GB VPS | 500 active, 50 req/s sustained | The single-VPS deployment target of ADR-019 |
| Gunicorn workers | 3 sync workers, 60 s timeout | CPU-bound work is negligible; database waits dominate |
| Database connections | ≤ 3 workers × 1 + scheduler 1 + headroom = 10 | `CONN_MAX_AGE=60` with `CONN_HEALTH_CHECKS` |

The performance test fixture seeds one tenant with 100 000 ledger entries, 5 000 parties, 2 000 items and 10 000 documents, and CI runs `EXPLAIN` on every list endpoint's query asserting no sequential scan on those tables (Part 21 §21.4). A regression there is a build failure, not a ticket.

---

## 20.15 What an AI coding agent must not do

A closing list, because this chapter's purpose is to remove invention:

1. Do not add a dependency. The allow-list is ADR-021 plus `uuid6`. Anything else is a CR.
2. Do not introduce Celery, Redis, a message broker, a cache server or an object store. `platform_job` and `MEDIA_ROOT` are the answers.
3. Do not put business logic in a view, a serializer, a signal, a `save()` override or a model property.
4. Do not query inside `to_representation`.
5. Do not use `float`, `round()`, or `%`-formatting for money. Use `Decimal` and `q2`/`q3`/`q4`.
6. Do not `UPDATE` or `DELETE` a `ledger_entry` or an `inventory_stock_movement` for any reason.
7. Do not read `X-Tenant-Id`. Do not trust any client-supplied tenant hint.
8. Do not return 403 for a cross-tenant id. Return 404.
9. Do not compute totals on the client's numbers. Recompute server-side, always.
10. Do not skip the audit row on a state change, or the `Idempotency-Key` support on a document/payment/entry POST.
11. Do not write a migration that is not backwards-compatible with the previous release.
12. Do not invent an error code, a status value, a permission codename or a table name. They are all in Part 0 and Part 21.
13. Do not ship a feature without tests, permission checks, states and `en`+`hi` messages (canon §0.11 rule 6).
