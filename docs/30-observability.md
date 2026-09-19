# Part 30 — Observability

> **Status:** normative.
>
> **The constraint:** ADR-018 permits **stdlib `logging` with structured JSON**, a request-id middleware written in-house, and `/system/health`. Sentry, OpenTelemetry and Prometheus are explicitly Phase-2, settings-gated add-ons. ADR-012 removes Redis, so there is no shared cache to hold counters. ADR-019 puts MVP on one VPS running docker-compose with one operator.
>
> **The consequence:** at MVP, observability is **three surfaces** — application logs on disk, the audit log in PostgreSQL, and the `platform_job` table — plus SQL against tables that already exist. This chapter specifies each of them precisely enough to build, and then specifies the seams so that adding OpenTelemetry, Sentry or Prometheus later is a configuration change and a dependency, not a refactor.
>
> **The honest framing:** a single operator watching a daily digest and an operations page is a modest posture. It is stated as such rather than dressed up, and §30.12 says exactly what triggers the upgrade.

---

## 30.1 The three surfaces, and what each answers

| Surface | Lives in | Answers | Retention | Audience |
|---|---|---|---|---|
| **Application log** | JSON lines in `UB_LOG_DIR`, and stdout in dev | "What did the process do, and how long did it take?" | 30 days | Engineer, during and after an incident |
| **Audit log** (`platform_audit_log`) | PostgreSQL | "Who changed what business fact, when, and why?" | ≥ 7 years | Merchant, accountant, support, auditor, regulator |
| **Job table** (`platform_job`) | PostgreSQL | "What background work is queued, stuck, retrying or dead?" | 14 d succeeded, 180 d dead-letter | Operator |

They are not substitutes for one another and the distinction is enforced (§30.5). A log line is transient, unqueryable by a merchant, and may not contain PII. An audit row is permanent, queryable by the tenant's owner, and is *allowed* to contain the business values that changed.

---

## 30.2 Logging architecture

### 30.2.1 Format

One JSON object per line, one line per event, UTF-8, no multi-line records except a traceback which is carried as a single escaped string field.

```json
{"ts":"2026-09-18T07:41:22.118Z","level":"INFO","logger":"ub.ledger","event":"ledger.entry.posted",
 "request_id":"0192f3c1-6d2e-7a3b-9f10-4c2b8de10a77","tenant_id":"0192f3bd-…","user_id":"0192f3aa-…",
 "entry_id":"0192f3c1-…","direction":"debit","amount":"500.00","entry_type":"manual_gave",
 "env":"production","version":"a3f91c2","host":"ub-vps-1","pid":41}
```

**Every record carries** `ts`, `level`, `logger`, `event`, `request_id`, `env`, `version`, `host`, `pid`. Records produced inside a request also carry `tenant_id` and `user_id`; records produced inside a job carry `tenant_id`, `job_id` and `job_type`. These eight-to-eleven fields are injected by a filter, never written by the caller.

`message` and `event` are the same string by convention — a stable, dotted, lowercase identifier (`ledger.entry.posted`), never an interpolated sentence. This is what makes `grep '"event":"job.dead_letter"'` a complete monitoring tool at this scale.

In development `UB_LOG_FORMAT=console` switches to a human formatter (`07:41:22 INFO ub.ledger ledger.entry.posted entry_id=… amount=500.00`) because JSON on a terminal is hostile to a person.

### 30.2.2 The formatter and the filters

```python
# apps/common/logging.py
import json
import logging
import re
from datetime import datetime, timezone

from django.conf import settings

from apps.common.tenancy import current_tenant
from apps.common.context_vars import current_request_id, current_user_id, current_job

BASE_KEYS = {"ts", "level", "logger", "event", "request_id", "tenant_id", "user_id",
             "env", "version", "host", "pid", "job_id", "job_type"}
RESERVED = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__) | {"asctime", "message"}


class ContextFilter(logging.Filter):
    """Injects request/tenant/job identity into every record. Callers never set these."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = current_request_id() or "-"
        tenant = current_tenant()
        record.tenant_id = str(tenant.id) if tenant else None
        record.user_id = current_user_id()
        job = current_job()
        record.job_id, record.job_type = (job or (None, None))
        record.env = settings.ENV_NAME
        record.version = settings.VERSION
        return True


MOBILE_RE = re.compile(r"\+?\d{10,15}")
JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+")
SECRET_KEYS = {"password", "pwd", "secret", "token", "access_token", "refresh_token",
               "authorization", "cookie", "set-cookie", "api_key", "otp", "code",
               "code_hash", "idempotency_key", "mobile", "alt_phone", "email",
               "gstin", "address", "billing_address", "shipping_address", "full_name", "name"}
REDACTED = "[redacted]"


class RedactingFilter(logging.Filter):
    """Structural defence against PII and secrets in logs (Part 27 §27.14).

    Redacts by key name and by value pattern, so a careless `extra` cannot leak
    even when the developer did not think about it. Masks rather than removes
    mobile numbers so a support conversation is still possible ("+91XXXXXX3210").
    """

    def filter(self, record: logging.LogRecord) -> bool:
        for key, value in list(record.__dict__.items()):
            if key in RESERVED or key in BASE_KEYS:
                continue
            if key.lower() in SECRET_KEYS:
                record.__dict__[key] = _mask_mobile(value) if "mobile" in key.lower() else REDACTED
            elif isinstance(value, str):
                record.__dict__[key] = JWT_RE.sub(REDACTED, MOBILE_RE.sub(_mask, value))
        if isinstance(record.msg, str):
            record.msg = JWT_RE.sub(REDACTED, MOBILE_RE.sub(_mask, record.msg))
        return True


def _mask(m: re.Match) -> str:
    digits = m.group(0)
    return f"{digits[:3]}XXXXXX{digits[-4:]}" if len(digits) >= 10 else REDACTED


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.fromtimestamp(record.created, timezone.utc)
                          .isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "level": record.levelname,
            "logger": record.name,
            "event": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
            "tenant_id": getattr(record, "tenant_id", None),
            "user_id": getattr(record, "user_id", None),
            "env": getattr(record, "env", "?"),
            "version": getattr(record, "version", "?"),
            "host": settings.HOSTNAME,
            "pid": record.process,
        }
        if getattr(record, "job_id", None):
            payload["job_id"] = record.job_id
            payload["job_type"] = record.job_type
        for key, value in record.__dict__.items():
            if key not in RESERVED and key not in payload:
                payload[key] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)[-8000:]
        return json.dumps(payload, default=str, ensure_ascii=False)
```

### 30.2.3 The logger hierarchy

One logger per app, named `ub.<app>`, plus four cross-cutting ones. `logging.getLogger(__name__)` is banned (§26.9.1) because it ties the hierarchy to file paths.

| Logger | Emits |
|---|---|
| `ub.api` | Request access lines, unhandled exceptions, slow requests |
| `ub.security` | Auth events, permission denials, throttle breaches, impersonation, share-link access |
| `ub.jobs` | Claim, succeed, retry, dead-letter, reap, schedule materialisation |
| `ub.db` | Slow queries (dev and a production threshold) |
| `ub.platform`, `ub.parties`, `ub.ledger`, `ub.inventory`, `ub.sales`, `ub.purchases`, `ub.payments`, `ub.expenses`, `ub.notifications`, `ub.imports`, `ub.reports`, `ub.files`, `ub.tax` | Domain events for that app |
| `ub.sms` | The console SMS backend's output (this is how a developer reads an OTP) |
| `django`, `django.request`, `django.db.backends` | Framework; level `WARNING` in production |

```python
# config/settings/base.py (excerpt)
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {
        "context": {"()": "apps.common.logging.ContextFilter"},
        "redact": {"()": "apps.common.logging.RedactingFilter"},
    },
    "formatters": {
        "json": {"()": "apps.common.logging.JsonFormatter"},
        "console": {"()": "apps.common.logging.ConsoleFormatter"},
    },
    "handlers": {
        "stdout": {"class": "logging.StreamHandler", "stream": "ext://sys.stdout",
                   "formatter": env.str("UB_LOG_FORMAT", "json"),
                   "filters": ["context", "redact"]},
        "file": {"class": "logging.handlers.RotatingFileHandler",
                 "filename": str(LOG_DIR / "app.log"),
                 "maxBytes": 64 * 1024 * 1024, "backupCount": 10,
                 "formatter": "json", "filters": ["context", "redact"]},
        "security_file": {"class": "logging.handlers.RotatingFileHandler",
                          "filename": str(LOG_DIR / "security.log"),
                          "maxBytes": 32 * 1024 * 1024, "backupCount": 30,
                          "formatter": "json", "filters": ["context", "redact"]},
    },
    "root": {"handlers": ["stdout", "file"], "level": "WARNING"},
    "loggers": {
        "ub": {"handlers": ["stdout", "file"], "level": env.str("UB_LOG_LEVEL", "INFO"),
               "propagate": False},
        "ub.security": {"handlers": ["stdout", "file", "security_file"], "level": "INFO",
                        "propagate": False},
        "django.request": {"handlers": ["stdout", "file"], "level": "WARNING", "propagate": False},
        "django.db.backends": {"handlers": ["stdout"], "level": "DEBUG" if LOG_SQL else "WARNING",
                               "propagate": False},
    },
}
```

`ub.security` is duplicated to its own file with a 30-file rotation, because security forensics needs a longer and less noisy window than general application logs.

### 30.2.4 Levels — when each is used

| Level | Meaning | Examples |
|---|---|---|
| `DEBUG` | Developer detail. Never enabled in production. | Query plans, tax-engine intermediates |
| `INFO` | A business or system event happened as designed. | `ledger.entry.posted`, `invoice.issued`, `job.succeeded`, `auth.login_success`, `sms.console` |
| `WARNING` | An anomaly the system handled. Someone may want to know; nobody must act tonight. | `job.retrying`, `credit_limit.warned`, `slow_request`, `rate_limit.exceeded`, `stock.negative_allowed` |
| `ERROR` | Something failed and a human may need to act. | `job.dead_letter`, `unhandled_exception`, `auth.refresh_reuse_detected`, `invariant.violated` |
| `CRITICAL` | The process cannot serve traffic. | Startup assertion failure (`DEBUG=True` in production, missing `SECRET_KEY`) |

**A 4xx caused by user input is not an ERROR.** Validation failures, 404s and permission denials are INFO or WARNING. Logging them at ERROR makes the error stream worthless in a week, which is the most common way a team loses its ability to notice real failures.

### 30.2.5 Correlation: request id from the client to the SQL statement

```
client sets X-Request-Id ──► RequestIdMiddleware ──► contextvar ──► every log record
                                    │                     │
                                    │                     └──► audit_log.metadata.request_id
                                    │                     └──► platform_job.payload._request_id
                                    │                     └──► SQL statement comment
                                    └──► response header X-Request-Id
```

```python
# apps/common/middleware.py
SAFE_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


class RequestIdMiddleware:
    """Accept or mint a request id, bind it, echo it (canon §22.1 'Tracing')."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        incoming = request.headers.get("X-Request-Id", "")
        rid = incoming if SAFE_ID.match(incoming) else str(uuid6.uuid7())
        request.request_id = rid
        token = _request_id_var.set(rid)
        try:
            response = self.get_response(request)
        finally:
            _request_id_var.reset(token)
        response["X-Request-Id"] = rid
        return response
```

The client-supplied value is sanitised (a request id is never used for authorisation, but it is written into logs and must not be able to inject a newline or a field).

**Into the database.** Postgres records the statement text in `pg_stat_activity` and in the slow-query log; putting the request id there is what lets an operator connect a long-running query to the request that caused it, with no APM.

```python
# apps/common/db/instrumentation.py
def sql_comment_wrapper(execute, sql, params, many, context):
    """Django execute_wrapper: prefix every statement with a sqlcommenter-style comment.

    Produces:  /*rid='0192f3c1…',tid='0192f3bd…',app='ub'*/ SELECT …
    Cheap (string concat), safe (the comment is built from validated ids only),
    and it is the seam OpenTelemetry's psycopg instrumentation would later reuse
    (§30.12) — traceparent simply becomes another key in the same comment.
    """
    rid = current_request_id()
    tenant = current_tenant()
    if rid:
        tid = str(tenant.id) if tenant else "-"
        sql = f"/*rid='{rid}',tid='{tid}',app='ub'*/ {sql}"
    return execute(sql, params, many, context)
```

Installed in `CommonConfig.ready()` via `connection.execute_wrapper(...)` bound per-request in middleware. Comments are stripped by Postgres's planner cache key handling in 16 only when `pg_stat_statements.track_utility` semantics apply; to avoid diluting `pg_stat_statements`, the wrapper is enabled in production only when `UB_SQL_COMMENT=true` (default on, documented as a switch).

---

## 30.3 The canonical log-event catalogue

Every event the backend may emit. An event not in this table requires a line added here — this is what keeps the catalogue a catalogue rather than a wish.

| Event | Logger | Level | Fields beyond the base set | Emitted where |
|---|---|---|---|---|
| `http.request` | `ub.api` | INFO | `method`, `path_template`, `status`, `duration_ms`, `query_count`, `bytes` | `AccessLogMiddleware`, one per request |
| `http.slow_request` | `ub.api` | WARNING | as above | Same, when `duration_ms > 1000` |
| `http.client_error` | `ub.api` | INFO | `status`, `error_code`, `path_template` | Exception handler, 4xx |
| `unhandled_exception` | `ub.api` | ERROR | `exc`, `path_template`, `error_code="server_error"` | Exception handler, 5xx |
| `db.slow_query` | `ub.db` | WARNING | `duration_ms`, `sql_digest`, `table` | Query wrapper when `> 500 ms` |
| `auth.otp_requested` | `ub.security` | INFO | `mobile_masked`, `purpose`, `challenge_id` | OTP request view |
| `auth.otp_failed` | `ub.security` | WARNING | `challenge_id`, `attempts_left` | OTP verify view |
| `auth.otp_throttled` | `ub.security` | WARNING | `mobile_masked`, `scope` | Throttle |
| `auth.login_success` | `ub.security` | INFO | `mobile_hash`, `method` (`otp`/`password`), `session_id`, `device_label` | Login/verify |
| `auth.login_failed` | `ub.security` | WARNING | `mobile_hash`, `reason` (`unknown`/`bad_password`) | Login |
| `auth.refresh_rotated` | `ub.security` | INFO | `session_id`, `family_id` | Refresh |
| `auth.refresh_reuse_detected` | `ub.security` | **ERROR** | `family_id`, `user_id`, `sessions_revoked` | Refresh |
| `auth.session_revoked` | `ub.security` | INFO | `session_id`, `scope` (`one`/`all`) | Logout |
| `auth.token_stale` | `ub.security` | INFO | `claim_ver`, `db_ver` | Permission layer |
| `authz.permission_denied` | `ub.security` | WARNING | `codename`, `action`, `role`, `path_template` | `HasPermission` |
| `authz.module_disabled` | `ub.security` | INFO | `module` | `ModuleEnabled` |
| `authz.plan_limit_reached` | `ub.security` | WARNING | `limit_key`, `cap` | `PlanLimit` |
| `authz.impersonation_started` | `ub.security` | WARNING | `target_tenant_id`, `grant_expires_at` | Impersonation service |
| `authz.impersonated_request` | `ub.security` | INFO | `target_tenant_id`, `method`, `path_template` | Tenancy resolution |
| `rate_limit.exceeded` | `ub.security` | WARNING | `scope`, `key_hash`, `limit` | Throttle |
| `share_link.created` | `ub.security` | INFO | `kind`, `object_id`, `expires_at` | Share-link service |
| `share_link.accessed` | `ub.security` | INFO | `kind`, `object_id`, `ip_truncated`, `view_count` | Public view |
| `share_link.denied` | `ub.security` | WARNING | `reason` (`expired`/`revoked`/`unknown`), `ip_truncated` | Public view |
| `ledger.entry.posted` | `ub.ledger` | INFO | `entry_id`, `party_id`, `direction`, `amount`, `entry_type` | `post_entry` |
| `ledger.entry.reversed` | `ub.ledger` | INFO | `entry_id`, `reversal_id` | `reverse_entry` |
| `ledger.entry.corrected` | `ub.ledger` | INFO | `entry_id`, `reversal_id`, `replacement_id`, `changed` | `correct_entry` |
| `ledger.credit_limit.warned` / `.blocked` / `.overridden` | `ub.ledger` | WARNING | `party_id`, `limit`, `balance_after` | `post_entry` |
| `invoice.issued` | `ub.sales` | INFO | `document_id`, `number`, `grand_total`, `lines`, `duration_ms` | `issue_invoice` |
| `invoice.voided` | `ub.sales` | INFO | `document_id`, `number`, `reason_len` | `void_invoice` |
| `document.number_allocated` | `ub.sales` | INFO | `kind`, `fy_label`, `n` | `allocate_number` |
| `stock.movement.posted` | `ub.inventory` | INFO | `item_id`, `qty`, `movement_type`, `on_hand_after` | `post_movement` |
| `stock.insufficient` | `ub.inventory` | WARNING | `item_id`, `on_hand`, `requested` | `post_movement` |
| `stock.low_detected` | `ub.inventory` | INFO | `item_id`, `on_hand`, `reorder_point` | Low-stock scan |
| `payment.recorded` / `.voided` | `ub.payments` | INFO | `payment_id`, `direction`, `amount`, `allocations` | Payment service |
| `sms.console` | `ub.sms` | INFO | `to_masked`, `template`, `body` | `ConsoleSmsBackend` (dev only in practice) |
| `message.sent` / `.failed` / `.skipped` | `ub.notifications` | INFO / WARNING / INFO | `message_log_id`, `channel`, `template`, `reason` | Messaging service |
| `job.enqueued` | `ub.jobs` | INFO | `job_id`, `job_type`, `priority`, `run_after` | `enqueue` |
| `job.deduplicated` | `ub.jobs` | INFO | `job_type`, `token` | `enqueue` |
| `job.claimed` | `ub.jobs` | DEBUG | `job_id`, `job_type`, `attempts` | Runner |
| `job.succeeded` | `ub.jobs` | INFO | `job_id`, `job_type`, `duration_ms` | Runner |
| `job.retrying` | `ub.jobs` | WARNING | `job_id`, `job_type`, `attempts`, `next_in_s`, `error_class` | Runner |
| `job.dead_letter` | `ub.jobs` | **ERROR** | `job_id`, `job_type`, `attempts`, `error_class` | Runner |
| `job.reclaimed` | `ub.jobs` | WARNING | `job_id`, `job_type`, `locked_by` | Visibility-timeout reaper |
| `schedule.materialised` | `ub.jobs` | INFO | `created`, `period` | Scheduler |
| `import.started` / `.completed` / `.failed` | `ub.imports` | INFO / INFO / ERROR | `import_id`, `kind`, `rows`, `errors` | Import handlers |
| `export.requested` / `.completed` | `ub.reports` | INFO | `export_id`, `report`, `format`, `rows` | Export handlers |
| `invariant.violated` | `ub.platform` | **ERROR** | `check`, `count`, `sample_ids` | `check_invariants` |
| `recalc.drift_found` | `ub.platform` | ERROR | `kind`, `count` | `recalc_*` |
| `startup.ok` | `ub.platform` | INFO | `version`, `env`, `migrations_applied` | `AppConfig.ready` |
| `startup.assertion_failed` | `ub.platform` | CRITICAL | `assertion` | `prod.py` |

---

## 30.4 What must never be logged

Enforced by `RedactingFilter`, not by memory. Restated from Part 27 §27.14 because this is the chapter an engineer reads before adding a log line.

| Never | Instead |
|---|---|
| OTP codes, passwords, password hashes | Nothing. The OTP appears in the SMS body on the `ub.sms` logger only, which is a development backend |
| JWTs, cookies, `Authorization` headers, CSRF tokens, `Idempotency-Key` values | `session_id`, `user_id` |
| Full request or response bodies | The validated field *names* that failed, and the error code |
| Unmasked mobile numbers | `+91XXXXXX3210`, or `sha256(mobile + pepper)[:16]` for auth events |
| Party names, addresses, email, GSTIN | `party_id` |
| File contents, CSV rows | `import_id`, row **numbers**, error codes |
| Share-link tokens | `sha256(token)[:12]` |
| Another tenant's ids in a tenant-scoped line | Nothing |
| Stack traces in a response body | `request_id`; the trace is in the log |

A test asserts the filter: it logs a record containing a mobile number, a JWT, a password key and a party name, and asserts none of them survives into the formatted output.

---

## 30.5 The audit log as the business-observability surface

The audit log is not a log; it is a product feature that happens to be useful to engineers.

| Dimension | Application log | Audit log |
|---|---|---|
| Question | "What did the process do?" | "Who changed what business fact?" |
| Written by | `logger.info(...)`, anywhere | `write_audit(...)`, in a service, in the transaction |
| Durability | Rotates in 30 days; lost if the disk is lost | Permanent, backed up, append-only trigger |
| Transactionality | Written even when the transaction rolls back | Written **only** if the change commits |
| PII | Forbidden | Permitted, scoped to a reader already entitled to it |
| Readable by | Engineers with shell access | Owner, admin, accountant via `GET /audit-logs` |
| Granularity | Every step | One row per logical business event |
| Retention | 30 days | ≥ 7 years |

The rule: **if a merchant, an accountant or a regulator could ask the question, the answer belongs in the audit log.** If only an engineer could ask it, it belongs in the application log. "Who voided invoice INV/26-27/0042 and why" is an audit question. "Why did that request take 4 seconds" is a log question.

The two are joined by `request_id`, which appears in `platform_audit_log.metadata.request_id` and in every log line of that request. That single field is the entire correlation strategy at MVP, and it is enough: given an audit row, an engineer can reconstruct the request; given a log line, a support agent can find the business change.

`GET /audit-logs?entity_type=&entity_id=&actor_id=&action=&date_from=&date_to=` (§22.3, permission `platform.audit.read`) is the merchant-facing view; it is paginated by cursor over `(created_at DESC, id DESC)` and served by the `(tenant_id, created_at DESC)` index.

---

## 30.6 `platform_job` as the background-work surface

There is no Flower, no Celery dashboard, and none is needed: the queue is a table, so the dashboard is a query.

**The failure dashboard** is a super-admin page (§30.8) and a management command backed by these five queries:

```sql
-- 1. Queue health, right now.
SELECT status, count(*), min(created_at) AS oldest
FROM platform_job GROUP BY status ORDER BY status;

-- 2. Backlog age — the single most important number. If the oldest queued job is
--    more than a few minutes old, the scheduler is down or wedged.
SELECT job_type, count(*) AS queued,
       EXTRACT(EPOCH FROM now() - min(run_after))::int AS oldest_wait_s
FROM platform_job WHERE status = 'queued' AND run_after <= now()
GROUP BY job_type ORDER BY oldest_wait_s DESC;

-- 3. Dead letters in the last 24 h, by type and error class.
SELECT job_type, split_part(error, ':', 1) AS error_class, count(*), max(finished_at)
FROM platform_job
WHERE status = 'dead_letter' AND finished_at > now() - interval '24 hours'
GROUP BY 1, 2 ORDER BY 3 DESC;

-- 4. Retry storms — a type failing repeatedly but not yet dead.
SELECT job_type, count(*) FILTER (WHERE attempts > 1) AS retrying, avg(attempts)::numeric(4,1)
FROM platform_job WHERE status = 'queued' AND attempts > 0 GROUP BY 1 ORDER BY 2 DESC;

-- 5. Stuck jobs — running longer than their visibility timeout implies a dead runner.
SELECT id, job_type, locked_by, EXTRACT(EPOCH FROM now() - locked_at)::int AS running_s
FROM platform_job WHERE status = 'running' AND locked_at < now() - interval '10 minutes'
ORDER BY locked_at;
```

Operator commands: `manage.py jobs ls --status dead_letter --since 24h`, `jobs show <id>` (prints payload, error, attempts, timings), `jobs requeue <id>` (audited), `jobs cancel <id>`.

Because `enqueue()` is transactional (Part 20 §20.8.3), a job that is missing means the business transaction rolled back — which is itself diagnostic information, and is the reason this design needs no "was it published?" instrumentation.

---

## 30.7 Health and readiness

Three endpoints, unauthenticated, deliberately different.

| Endpoint | Checks | Response | Use |
|---|---|---|---|
| `GET /api/v1/system/health` | **Nothing.** Returns 200 and `{"status":"ok"}` if the process can serve a request. | 200, < 5 ms, no database | The container/`compose` healthcheck and the load balancer. A liveness probe that touches the database restarts the app when the database hiccups — the wrong action. |
| `GET /api/v1/system/ready` | Database `SELECT 1` within 2 s; unapplied-migration count is 0; `MEDIA_ROOT` writable; scheduler heartbeat fresher than 5 minutes. | 200 with a per-check map, or 503 with the failing checks named. Never reveals versions, hostnames or connection strings. | Deployment gate and the operations page |
| `GET /api/v1/system/version` | — | `{"version": "<commit sha>", "env": "production", "api": "v1"}` | Confirming what is deployed; correlating a log's `version` field |

The **scheduler heartbeat** is a row in `platform_job` semantics rather than a new table: `run_scheduler` upserts a `platform_tenant_setting`-style singleton row (`platform_heartbeat`, `component='scheduler'`, `beat_at`) on every loop. Readiness reports the scheduler as stale when `beat_at` is older than five minutes — which is the only way, without a metrics system, to notice that the background half of the product has silently stopped.

---

## 30.8 The built-in operations console

A super-admin-only page (`/admin/ops` in the frontend, backed by `GET /api/v1/admin/ops/*`, permission: `is_super_admin`), because with no Grafana the product must show its own health. Every panel is one indexed query.

| Panel | Source | Shows |
|---|---|---|
| **Recent errors** | `platform_job` dead letters + a tail of `logs/app.log` filtered to `level=ERROR` (read server-side, last 200 lines, never exposed raw) | Time, event, request id, tenant, error class |
| **Failed jobs** | §30.6 query 3 | Job type, error class, count, last seen, requeue button |
| **Queue backlog** | §30.6 query 2 | Queued count and oldest wait per job type; red above 5 minutes |
| **Slow requests** | An in-process ring buffer of the last 200 requests over 1 s, per worker | Path template, duration, query count, request id |
| **Invariant status** | Last `check_invariants` run | Per check: pass/fail, count, timestamp |
| **Message delivery** | `notifications_message_log` last 24 h | Sent / failed / skipped by channel and template |
| **Tenant activity** | `platform_audit_log` last 24 h grouped by tenant | Rows per tenant — spots both a runaway integration and a silent tenant |
| **Auth anomalies** | `security.log` counts | Failed logins per mobile hash, permission denials per user, throttle breaches |
| **Scheduler heartbeat** | `platform_heartbeat` | Last beat, jobs processed in the last hour |

The slow-request ring buffer is per-process and lost on restart. That is acceptable for a panel whose job is "what is slow *right now*"; the durable version of the same question is the log file.

---

## 30.9 Metrics as SQL

With no metrics system, the metrics that matter are queries. These are stored in `docs/runbooks/metrics.sql`, run by the daily digest job, and shown on the operations console.

```sql
-- Business volume (the numbers a founder actually watches)
SELECT date_trunc('day', created_at) AS day,
       count(*) FILTER (WHERE entry_type IN ('manual_gave','manual_got')) AS manual_entries,
       count(DISTINCT tenant_id) AS active_tenants,
       count(DISTINCT party_id)  AS active_parties
FROM ledger_entry WHERE created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 1;

SELECT count(*) AS invoices_issued, sum(grand_total) AS gmv
FROM sales_document
WHERE kind IN ('invoice','bill_of_supply') AND status <> 'draft'
  AND issued_at > now() - interval '24 hours';

-- Reliability
SELECT count(*) FILTER (WHERE status='dead_letter') AS dead,
       count(*) FILTER (WHERE status='queued' AND run_after <= now()) AS pending,
       max(EXTRACT(EPOCH FROM now()-run_after))::int FILTER (WHERE status='queued') AS max_wait_s
FROM platform_job WHERE created_at > now() - interval '24 hours';

SELECT channel, status, count(*)
FROM notifications_message_log WHERE created_at > now() - interval '24 hours'
GROUP BY 1,2 ORDER BY 1,2;

-- Correctness (should always return zero rows; see Part 20 §20.11.5)
SELECT count(*) AS balance_drift FROM parties_party p
JOIN (SELECT party_id,
             COALESCE(SUM(amount) FILTER (WHERE direction='debit'  AND status='posted'),0)
           - COALESCE(SUM(amount) FILTER (WHERE direction='credit' AND status='posted'),0) AS b
      FROM ledger_entry GROUP BY party_id) l ON l.party_id = p.id
WHERE p.balance <> l.b;

-- Security
SELECT date_trunc('hour', created_at) AS hour, action, count(*)
FROM platform_audit_log
WHERE action IN ('auth.login_failed','authz.permission_denied','tenant.impersonation.request')
  AND created_at > now() - interval '24 hours' GROUP BY 1,2 ORDER BY 1 DESC;

-- Performance, from Postgres itself (pg_stat_statements is enabled in the db image)
SELECT calls, round(mean_exec_time::numeric,1) AS mean_ms, round(total_exec_time::numeric) AS total_ms,
       left(query, 120) AS q
FROM pg_stat_statements WHERE calls > 50 ORDER BY total_exec_time DESC LIMIT 20;

-- Growth / capacity
SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) AS size, n_live_tup
FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 15;
```

`pg_stat_statements` is the closest thing to an APM available for free, and it is enabled in the `db` image's init script. With the SQL comment from §30.2.5, a slow statement carries the request id that produced it.

---

## 30.10 Alerting at MVP

One operator, no pager, no PagerDuty. The alerting story is therefore three channels and it is stated honestly.

| Channel | Trigger | Delivery |
|---|---|---|
| **Immediate email** | Any `job.dead_letter`; any `CRITICAL`; `auth.refresh_reuse_detected`; `invariant.violated`; readiness failing for 3 consecutive checks | `platform.alert_operator` job → SMTP (the one outbound the MVP allows, to a fixed operator address) |
| **Daily digest, 08:00 IST** | Always | The §30.9 queries, formatted: volume, dead letters, failed messages, drift checks, auth anomalies, top slow statements, disk and table growth |
| **Uptime check** | External, free-tier, hitting `/api/v1/system/health` every minute | The provider's email/SMS on 3 consecutive failures |

**What a single operator actually watches:** the daily digest every morning (2 minutes), the immediate emails when they arrive, and the operations console when something is reported. That is the whole loop. Its known weakness is time-to-detect for a slow degradation — the digest finds it within 24 hours, not 5 minutes — and that weakness is the explicit trigger for §30.12.

Alert hygiene: an alert that fires and is ignored is deleted or fixed. The dead-letter alert is grouped by `job_type` with a 1-hour suppression window so one broken handler sends one email, not four hundred.

---

## 30.11 Performance tracing with Django's own instrumentation

**Development.** `django-debug-toolbar` is a dev-only dependency (`requirements/dev.txt`, enabled only when `DEBUG` and the client IP is in `INTERNAL_IPS`), giving the SQL panel, query timings, duplicate-query detection and template timings. `UB_LOG_SQL=true` switches `django.db.backends` to DEBUG for a full statement log. Neither is present in `requirements/prod.txt`, so neither can be enabled in production by accident.

**Tests.** `django_assert_num_queries` enforces the per-endpoint budgets from Part 20 §20.14.1. This is the primary performance-regression defence and it runs on every PR — far more valuable than production tracing at this stage, because it catches the N+1 before it ships.

**Production.** Two in-house mechanisms, both ~30 lines:

```python
# apps/common/middleware.py
class AccessLogMiddleware:
    """One structured line per request, with the query count. The whole APM at MVP."""

    def __call__(self, request):
        started = time.perf_counter()
        queries_before = len(connection.queries_log)
        response = self.get_response(request)
        duration_ms = int((time.perf_counter() - started) * 1000)
        query_count = len(connection.queries_log) - queries_before
        event = "http.slow_request" if duration_ms > settings.SLOW_REQUEST_MS else "http.request"
        logger.log(
            logging.WARNING if duration_ms > settings.SLOW_REQUEST_MS else logging.INFO,
            event,
            extra={"method": request.method, "path_template": _route_template(request),
                   "status": response.status_code, "duration_ms": duration_ms,
                   "query_count": query_count},
        )
        SLOW_RING.record(request, duration_ms, query_count)   # feeds the ops console panel
        return response
```

```python
# apps/common/db/instrumentation.py
def slow_query_wrapper(execute, sql, params, many, context):
    started = time.perf_counter()
    try:
        return execute(sql, params, many, context)
    finally:
        ms = (time.perf_counter() - started) * 1000
        if ms > settings.SLOW_QUERY_MS:          # 500 ms default
            logging.getLogger("ub.db").warning(
                "db.slow_query",
                extra={"duration_ms": int(ms), "sql_digest": _digest(sql), "table": _table_of(sql)},
            )
```

`path_template` (`/api/v1/parties/{pk}`) rather than the raw path, so lines group and no id leaks into a dimension. `connection.queries_log` is a bounded deque that Django maintains regardless of `DEBUG`, capped at 9 000 entries — counting from it is free; reading the SQL from it is not done in production.

This gives per-request latency and query count for every request, retained 30 days, greppable and aggregable with `jq`. It is not distributed tracing. It is enough to answer "which endpoint got slow and when", which is the question an MVP actually has.

---

## 30.12 The upgrade path

The point of this chapter is that adding real observability later must be **configuration plus a dependency**, never a refactor. Six seams exist today and must be built today, even though nothing consumes them yet.

| Seam | Built now | What plugs in later |
|---|---|---|
| **S1 — Structured events with stable names** | Every log record is JSON with a dotted `event` field from the §30.3 catalogue | Any log aggregator (Loki, CloudWatch, an ELK stack) ingests without parsing rules. **Nothing changes in the code.** |
| **S2 — The context filter** | `ContextFilter` injects `request_id`, `tenant_id`, `user_id`, `job_id` into every record | OpenTelemetry's `trace_id`/`span_id` become two more fields set by the same filter — one function, five lines |
| **S3 — The SQL comment hook** | `execute_wrapper` prefixes `/*rid=…,tid=…,app='ub'*/` | `traceparent` is appended to the same comment; `opentelemetry-instrumentation-psycopg` reads it. The wrapper is already installed and already per-request |
| **S4 — The single exception handler** | `drf_exception_handler` is the one place a 5xx is produced, and it already has the request, the request id and the tenant | `sentry_sdk.capture_exception(exc)` is **one line** in that function, plus `sentry_sdk.init()` in `prod.py` gated on `UB_SENTRY_DSN`. No call site changes. The `RedactingFilter`'s key list becomes Sentry's `before_send` scrubber |
| **S5 — The middleware chain** | `RequestIdMiddleware` → `TenantContextMiddleware` → `AccessLogMiddleware` are ordered and own the request lifecycle | `OpenTelemetryMiddleware` inserts ahead of `RequestIdMiddleware` and adopts the incoming `traceparent`; `RequestIdMiddleware` prefers `trace_id` as the request id when present — a three-line change |
| **S6 — Counters as queries, not as globals** | Every number in §30.9 is a SQL query over a real table, and every timing is already emitted as a log field | A Prometheus exporter is a new app (`apps/metrics/`) exposing `/metrics` that runs those same queries plus in-process counters incremented in the **same** places that log today. The `AccessLogMiddleware` gains `REQUEST_DURATION.labels(...).observe(duration_ms)` next to its log call |

**What must not be done before the upgrade**, because each would make it a refactor:

- Do not write unstructured log messages with interpolated data (S1 breaks).
- Do not pass `request` into services to get the request id (S2 breaks — that is what `Ctx.request_id` is for).
- Do not catch exceptions in views and return 500 bodies yourself (S4 breaks).
- Do not compute business metrics into in-memory globals that no query can reproduce (S6 breaks).
- Do not scatter `time.time()` timing into business code; timing belongs to middleware and the job runner.

**The triggers for each upgrade** — written down so the decision is made on evidence, not on fashion:

| Upgrade | Trigger |
|---|---|
| **Log aggregation** (ship JSON lines off-host) | More than one application host, **or** the first incident where `grep` across rotated files costs more than an hour, **or** a partner's compliance requirement for off-host log retention. This is the first upgrade and it needs no code change at all. |
| **Sentry** | More than ~5 unhandled exceptions per day, **or** the first time an exception is discovered by a user report rather than by the operator. One line in the exception handler. |
| **Prometheus + Grafana** | More than one backend replica (per-process ring buffers stop being meaningful), **or** the first capacity-planning conversation, **or** a partner SLA requiring measured availability. |
| **OpenTelemetry tracing** | When the backend stops being one process — the first extracted service, the first external provider call in a hot path — because that is when a request id in a log file stops being sufficient to follow a request. |

Until a trigger fires, the posture in this chapter is the posture. ADR-018 is not a temporary compromise to be undone at the first opportunity; it is the correct answer for one process, one database and one operator, and the seams above are what keep it from becoming a trap.
