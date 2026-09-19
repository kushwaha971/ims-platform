# Part 29 — DevOps and Deployment

This part specifies how DigiKhaato is built, run, deployed, backed up and recovered. It is written for a product whose first deployment is **one machine running for one person** and whose second deployment is a small production VPS serving a few hundred tenants — and which must make that transition without a rewrite. Every decision below is made twice: once for the machine on the desk, once for the server, with the explicit constraint that the two configurations differ only in values, never in shape.

Governing decisions: docker-compose with `db`, `backend`, `scheduler`, `frontend` (plus `nginx` in production) — ADR-019. No Celery, no Redis — background work is `platform_job` rows drained by `manage.py run_scheduler` — ADR-012. No S3/MinIO — local `MEDIA_ROOT` through Django's storage API — ADR-013. No Sentry, no OpenTelemetry, no Prometheus — structured JSON logging to stdout and `/system/health` — ADR-018. PostgreSQL 16 in Docker for both development and production — ADR-008.

---

## 29.1 Environments

Three environments. The rule that governs all of them: **what differs is values; what must not differ is shape.**

| Aspect | Local | Staging | Production |
|---|---|---|---|
| Purpose | Development and the single-user deployment the product is first built for | Pre-release verification, migration rehearsal, E2E and performance runs | Serving merchants |
| Host | Developer machine (macOS/Linux), 8–16 GB RAM | One small VPS, 2 vCPU / 4 GB | One VPS, 4 vCPU / 8–16 GB, separate data volume |
| Compose file | `docker-compose.yml` + `docker-compose.override.yml` | `docker-compose.yml` + `docker-compose.staging.yml` | `docker-compose.yml` + `docker-compose.prod.yml` |
| Services | db, backend, scheduler, frontend | + nginx | + nginx |
| Django `DEBUG` | `True` | **`False`** | **`False`** |
| Frontend mode | `next dev`, hot reload, source mounted | `next build` + `next start` | `next build` + `next start` |
| Backend server | `runserver` (autoreload) | Gunicorn, 2 workers | Gunicorn, `2×vCPU+1` workers |
| TLS | none (plain HTTP), or `mkcert` for multi-host work | Let's Encrypt, single wildcard | Let's Encrypt per host |
| Database | container, volume `ub_db_data` | container, volume on the data disk | container, volume on a **separate mounted disk**, daily `pg_dump` off-host |
| `MEDIA_ROOT` | bind mount `./media` | named volume | named volume on the data disk |
| SMS / WhatsApp | `ConsoleSmsBackend`, `wa.me` links | Console | Console at MVP; provider adapters when configured (Part 24 §24.7) |
| Seed data | full demo seed (`seed_demo`) | E2E seed | reference data only, never demo data |
| Secrets | `.env` file, git-ignored | `.env` on the host, `chmod 600` | `.env` on the host, `chmod 600`, root-owned |
| Backups | none (or optional local dump) | daily, 7 days | daily + weekly, 30 days, off-host copy |
| Logs | pretty console | JSON to stdout → Docker json-file driver | JSON to stdout → json-file driver with rotation |

**What must be identical everywhere, and is asserted by a test (Part 28 §28.3.9):** the PostgreSQL major version (16), the Python version (3.12), the Node version (20 LTS), the Django settings module structure, the migration set, the seed commands, the service names, the internal port numbers, the environment-variable names, and the fact that the scheduler runs as its own process rather than inside the web server.

**What must never differ silently:** a setting that exists in one environment and not another. Every setting is declared in `config/settings/base.py` with a default; environment files override values, never introduce new keys. A key present in `.env` that no setting reads fails the settings test.

---

## 29.2 The docker-compose topology

### 29.2.1 Shape

```
                       ┌─────────────────────────────────────────┐
  :80 / :443 ─────────▶│  nginx        (prod/staging only)       │
                       │  TLS, static, /media, rate limit, proxy │
                       └───────┬───────────────────┬─────────────┘
                               │ /api, /admin       │ everything else
                               ▼                    ▼
                    ┌────────────────────┐  ┌──────────────────────┐
                    │ backend            │  │ frontend             │
                    │ Django + DRF       │  │ Next.js (standalone) │
                    │ gunicorn :8000     │  │ node server.js :3000 │
                    └─────┬──────────┬───┘  └──────────────────────┘
                          │          │  volumes: media, static
          ┌───────────────┘          └──────────────┐
          ▼                                          ▼
 ┌──────────────────┐                     ┌────────────────────────┐
 │ db  postgres:16  │◀────────────────────│ scheduler              │
 │ volume: ub_db    │                     │ loop: run_scheduler    │
 └──────────────────┘                     │ same image as backend  │
                                          └────────────────────────┘
```

Four rules about this topology:

1. **The scheduler is a separate service, not a thread in the web server.** It shares the backend image and code, runs a different command, and is the only process permitted to execute due jobs. Running it in-process would make a web restart drop jobs and would make two web workers double-process.
2. **The frontend never talks to the database.** It talks to the backend over HTTP, exactly as a browser does. Server components fetch with the internal URL (`http://backend:8000`), the browser with the public URL.
3. **No service depends on a service that does not exist locally.** nginx is absent locally; the frontend is reached directly on `:3000` and the backend on `:8000`. This is the one shape difference between local and production, and it is contained to routing.
4. **Volumes hold all state.** Containers are disposable; `ub_db_data`, `ub_media` and `ub_static` are not. A rebuild never touches them; a `docker compose down -v` destroys them and is documented as such in every runbook.

### 29.2.2 `docker-compose.yml` (base, used by every environment)

```yaml
# docker-compose.yml — base topology, shared by local, staging and production.
# Environment-specific behaviour lives in docker-compose.override.yml (local, auto-loaded),
# docker-compose.staging.yml and docker-compose.prod.yml.
name: udhaarbook

x-backend-env: &backend-env
  DJANGO_SETTINGS_MODULE: ${DJANGO_SETTINGS_MODULE:-config.settings.local}
  UB_SECRET_KEY: ${UB_SECRET_KEY:?UB_SECRET_KEY is required}
  UB_DEBUG: ${UB_DEBUG:-0}
  UB_ENV_NAME: ${UB_ENV_NAME:-local}
  UB_ALLOWED_HOSTS: ${UB_ALLOWED_HOSTS:-localhost,127.0.0.1,backend}
  DATABASE_URL: postgresql://${POSTGRES_USER:-udhaarbook}:${POSTGRES_PASSWORD:?required}@db:5432/${POSTGRES_DB:-udhaarbook}
  UB_DEFAULT_TIMEZONE: ${UB_DEFAULT_TIMEZONE:-Asia/Kolkata}
  UB_DEFAULT_LOCALE: ${UB_DEFAULT_LOCALE:-en}
  UB_MEDIA_ROOT: /srv/media
  UB_STATIC_ROOT: /srv/static
  UB_PUBLIC_BASE_URL: ${UB_PUBLIC_BASE_URL:-http://localhost:3000}
  UB_CORS_ALLOWED_ORIGINS: ${UB_CORS_ALLOWED_ORIGINS:-http://localhost:3000}
  UB_CSRF_TRUSTED_ORIGINS: ${UB_CSRF_TRUSTED_ORIGINS:-http://localhost:3000}
  UB_SMS_BACKEND: ${UB_SMS_BACKEND:-platform.messaging.backends.ConsoleSmsBackend}
  UB_WHATSAPP_BACKEND: ${UB_WHATSAPP_BACKEND:-platform.messaging.backends.DeepLinkWhatsAppBackend}
  UB_EMAIL_BACKEND: ${UB_EMAIL_BACKEND:-django.core.mail.backends.console.EmailBackend}
  UB_ACCESS_TOKEN_MINUTES: ${UB_ACCESS_TOKEN_MINUTES:-15}
  UB_REFRESH_TOKEN_DAYS: ${UB_REFRESH_TOKEN_DAYS:-30}
  UB_LOG_LEVEL: ${UB_LOG_LEVEL:-INFO}
  UB_LOG_FORMAT: ${UB_LOG_FORMAT:-json}
  UB_SCHEDULER_INTERVAL: ${UB_SCHEDULER_INTERVAL:-60}
  UB_SCHEDULER_BATCH: ${UB_SCHEDULER_BATCH:-50}
  UB_SCHEDULER_ENQUEUE_LOCK_ID: ${UB_SCHEDULER_ENQUEUE_LOCK_ID:-918273645}

services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-udhaarbook}
      POSTGRES_USER: ${POSTGRES_USER:-udhaarbook}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?required}
      POSTGRES_INITDB_ARGS: "--encoding=UTF8 --locale=C"
    volumes:
      - ub_db_data:/var/lib/postgresql/data
      - ./ops/postgres/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-udhaarbook} -d ${POSTGRES_DB:-udhaarbook}"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 20s
    stop_grace_period: 30s

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
      target: ${BACKEND_TARGET:-runtime}
    restart: unless-stopped
    environment:
      <<: *backend-env
      GUNICORN_WORKERS: ${GUNICORN_WORKERS:-3}
      GUNICORN_TIMEOUT: ${GUNICORN_TIMEOUT:-60}
    volumes:
      - ub_media:/srv/media
      - ub_static:/srv/static
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "python -c \"import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/v1/system/health', timeout=4).status==200 else 1)\""]
      interval: 20s
      timeout: 6s
      retries: 5
      start_period: 40s
    stop_grace_period: 30s

  scheduler:
    build:
      context: ./backend
      dockerfile: Dockerfile
      target: ${BACKEND_TARGET:-runtime}
    restart: unless-stopped
    command: ["python", "manage.py", "run_scheduler", "--loop",
              "--interval", "${UB_SCHEDULER_INTERVAL:-60}",
              "--batch", "${UB_SCHEDULER_BATCH:-50}"]
    environment:
      <<: *backend-env
      SERVICE_ROLE: scheduler
    volumes:
      - ub_media:/srv/media
    depends_on:
      db:
        condition: service_healthy
      backend:
        condition: service_healthy      # migrations have run before jobs are drained
    healthcheck:
      test: ["CMD-SHELL", "python manage.py scheduler_health --max-age 300"]
      interval: 60s
      timeout: 15s
      retries: 3
      start_period: 90s
    stop_grace_period: 60s               # let an in-flight job finish

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      target: ${FRONTEND_TARGET:-runtime}
      args:
        NEXT_PUBLIC_API_BASE_URL: ${NEXT_PUBLIC_API_BASE_URL:-http://localhost:8000/api/v1}
        NEXT_PUBLIC_APP_NAME: ${NEXT_PUBLIC_APP_NAME:-DigiKhaato}
    restart: unless-stopped
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      PORT: 3000
      INTERNAL_API_BASE_URL: http://backend:8000/api/v1
      NEXT_TELEMETRY_DISABLED: "1"
    depends_on:
      backend:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "node -e \"require('http').get('http://127.0.0.1:3000/api/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))\""]
      interval: 20s
      timeout: 6s
      retries: 5
      start_period: 30s

volumes:
  ub_db_data:
  ub_media:
  ub_static:
```

### 29.2.3 Environment overlays

```yaml
# docker-compose.override.yml — LOCAL. Auto-loaded by `docker compose up`.
services:
  db:
    ports: ["5432:5432"]                 # psql from the host
  backend:
    build: { target: dev }
    command: ["python", "manage.py", "runserver", "0.0.0.0:8000"]
    environment:
      DJANGO_SETTINGS_MODULE: config.settings.local
      UB_DEBUG: "1"
      UB_LOG_FORMAT: console
    volumes:
      - ./backend:/app                   # live reload
      - ub_media:/srv/media
      - ub_static:/srv/static
    ports: ["8000:8000"]
  scheduler:
    build: { target: dev }
    command: ["python", "manage.py", "run_scheduler", "--loop", "--interval", "30", "--batch", "20"]
    environment:
      DJANGO_SETTINGS_MODULE: config.settings.local
      UB_DEBUG: "1"
      UB_LOG_FORMAT: console
    volumes: ["./backend:/app", "ub_media:/srv/media"]
  frontend:
    build: { target: dev }
    command: ["npm", "run", "dev"]
    environment:
      NODE_ENV: development
    volumes:
      - ./frontend:/app
      - /app/node_modules                # keep the image's install
      - /app/.next
    ports: ["3000:3000"]
```

```yaml
# docker-compose.prod.yml — PRODUCTION.
# Usage: docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
services:
  db:
    # no published port: reachable only on the compose network
    command: >
      postgres
      -c shared_buffers=${PG_SHARED_BUFFERS:-1GB}
      -c effective_cache_size=${PG_EFFECTIVE_CACHE:-3GB}
      -c work_mem=${PG_WORK_MEM:-16MB}
      -c maintenance_work_mem=256MB
      -c max_connections=${PG_MAX_CONNECTIONS:-100}
      -c wal_level=replica
      -c max_wal_size=2GB
      -c checkpoint_completion_target=0.9
      -c log_min_duration_statement=${PG_SLOW_MS:-500}
      -c shared_preload_libraries=pg_stat_statements
    volumes:
      - /srv/udhaarbook/pgdata:/var/lib/postgresql/data     # separate mounted disk
      - ./ops/postgres/init:/docker-entrypoint-initdb.d:ro
    logging: &logging
      driver: json-file
      options: { max-size: "20m", max-file: "5" }

  backend:
    environment:
      DJANGO_SETTINGS_MODULE: config.settings.prod
      UB_DEBUG: "0"
    logging: *logging
    deploy:
      resources:
        limits: { memory: 2g }

  scheduler:
    environment:
      DJANGO_SETTINGS_MODULE: config.settings.prod
      UB_DEBUG: "0"
    logging: *logging
    deploy:
      resources:
        limits: { memory: 1g }

  frontend:
    logging: *logging
    deploy:
      resources:
        limits: { memory: 1g }

  nginx:
    image: nginx:1.27-alpine
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./ops/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ops/nginx/conf.d:/etc/nginx/conf.d:ro
      - ub_static:/srv/static:ro
      - ub_media:/srv/media:ro
      - /srv/udhaarbook/certs:/etc/letsencrypt:ro
      - /srv/udhaarbook/acme-challenge:/var/www/acme:ro
    depends_on:
      backend:   { condition: service_healthy }
      frontend:  { condition: service_healthy }
    logging: *logging

  backup:
    build: { context: ./backend, dockerfile: Dockerfile, target: runtime }
    restart: unless-stopped
    entrypoint: ["/app/ops/backup/loop.sh"]
    environment:
      <<: *backend-env
      PGPASSWORD: ${POSTGRES_PASSWORD:?required}
      BACKUP_DIR: /srv/backups
      BACKUP_HOUR_UTC: ${BACKUP_HOUR_UTC:-20}       # 01:30 IST ≈ 20:00 UTC
      BACKUP_KEEP_DAILY: ${BACKUP_KEEP_DAILY:-30}
      BACKUP_KEEP_WEEKLY: ${BACKUP_KEEP_WEEKLY:-12}
    volumes:
      - /srv/udhaarbook/backups:/srv/backups
      - ub_media:/srv/media:ro
    depends_on:
      db: { condition: service_healthy }
    logging: *logging
```

The staging overlay is the production overlay with smaller resource limits, `BACKUP_KEEP_DAILY: 7`, a single wildcard certificate, and the E2E seed permitted.

### 29.2.4 The `.env` catalogue

**This table is the single normative environment-variable catalogue for the product** (Part 0 §0.12; Part 42 CF-13 assigns ownership here, because this is the operator's document and the operator is the one who fills the file in). Part 20 §20.13.2 no longer carries a second catalogue — it cites this one. Two disjoint catalogues, each asserting completeness and each using a different prefix, is what Part 41 BA-07 found; the settings test below is bound to this table and to nothing else.

**Naming convention.** Every variable the **application** reads is prefixed `UB_` (the convention adopted from Part 20). Variables consumed by a *third-party* image or tool keep the name that tool requires and are never prefixed: `DJANGO_SETTINGS_MODULE`, `POSTGRES_*` and `DATABASE_URL` (the `postgres` image and libpq), `PG_*` (postgres server flags), `GUNICORN_*`, `NEXT_PUBLIC_*` / `INTERNAL_API_BASE_URL` (Next.js), `BACKUP_*` and `SUPERADMIN_IP_ALLOWLIST` (the backup container and nginx). The *Django setting* a variable feeds keeps its ordinary Django name — `UB_MEDIA_ROOT` sets `MEDIA_ROOT`, `UB_DEBUG` sets `DEBUG` — so only the environment namespace is prefixed.

**Settings modules** are `config.settings.{local,staging,prod,test}`, everywhere, with no other spelling permitted (Parts 20, 28 and 29 all use these four names).

One file per host, `chmod 600`, never committed. `.env.example` is this table, in order, with these defaults, and is asserted complete by the settings test (Part 28 §28.3.9): every variable any settings module reads appears here, and every variable here is read by something. A `UB_`-prefixed variable present in the environment and absent from this table logs a startup warning — a typo'd variable is otherwise silent and deadly.

**Application variables (`UB_`), read by `backend` and `scheduler`:**

| Variable | Default (local) | Required in prod | Secret | Meaning |
|---|---|---|---|---|
| `UB_SECRET_KEY` | *(none — required)* | **yes** | **yes** | Django signing key; also seeds hostname-verification tokens. Rotating it invalidates every token and session |
| `UB_DEBUG` | `1` local, `0` elsewhere | **yes → 0** | no | Asserted `0` in staging and production |
| `UB_ENV_NAME` | `local` | yes | no | `local` / `staging` / `production`; stamped on every log line |
| `UB_ALLOWED_HOSTS` | `localhost,127.0.0.1,backend` | **yes** | no | Comma list; extended at runtime by verified partner hostnames |
| `UB_CORS_ALLOWED_ORIGINS` | `http://localhost:3000` | yes | no | Exact origins; `*` is rejected at startup in production |
| `UB_CSRF_TRUSTED_ORIGINS` | `http://localhost:3000` | yes | no | Must include every partner host |
| `UB_COOKIE_DOMAIN` | *(empty)* | yes | no | `ub_access` / `ub_refresh` domain |
| `UB_COOKIE_SECURE` | `0` | **yes → 1** | no | |
| `UB_PUBLIC_BASE_URL` | `http://localhost:3000` | **yes** | no | Absolute URLs in share links, documents and messages; **never** taken from the `Host` header |
| `UB_API_BASE_PATH` | `/api/v1` | — | no | |
| `UB_DB_CONN_MAX_AGE` | `60` | — | no | Seconds; persistent connections. `0` disables |
| `UB_DB_STATEMENT_TIMEOUT_MS` | `15000` | — | no | Per-connection `statement_timeout` |
| `UB_DB_LOCK_TIMEOUT_MS` | `5000` | — | no | Per-connection `lock_timeout` (Part 20 §20.11.2) |
| `UB_ACCESS_TOKEN_MINUTES` | `15` | — | no | ADR-011 |
| `UB_REFRESH_TOKEN_DAYS` | `30` | — | no | ADR-011 |
| `UB_OTP_PEPPER` | `dev-otp-pepper` | **yes** | **yes** | Distinct from `UB_SECRET_KEY` |
| `UB_OTP_TTL_SECONDS` | `300` | — | no | |
| `UB_OTP_MAX_ATTEMPTS` | `5` | — | no | |
| `UB_SMS_BACKEND` | `…backends.ConsoleSmsBackend` | yes | no | Dotted path (ADR-015) |
| `UB_SMS_SENDER_ID` | `UDHAAR` | — | no | Default when the partner has none |
| `UB_WHATSAPP_BACKEND` | `…backends.DeepLinkWhatsAppBackend` | yes | no | Dotted path |
| `UB_EMAIL_BACKEND` | `…console.EmailBackend` | yes | no | Dotted path |
| `UB_MEDIA_ROOT` | `/srv/media` | yes | no | Uploads; bind-mounted volume |
| `UB_STATIC_ROOT` | `/srv/static` | yes | no | `collectstatic` output |
| `UB_MEDIA_MAX_UPLOAD_MB` | `10` | — | no | Per-file cap |
| `UB_LOG_LEVEL` | `INFO` | — | no | |
| `UB_LOG_FORMAT` | `json` (`console` locally) | — | no | Part 30 §30.2 |
| `UB_LOG_DIR` | `./logs` | yes | no | Rotating file handler target in production |
| `UB_LOG_SQL` | `0` | — | no | Local only; logs every query |
| `UB_JOBS_EAGER` | `0` (`1` in test) | no | no | Run jobs inline (Part 20 §20.8.10) |
| `UB_SCHEDULER_INTERVAL` | `60` | — | no | Seconds between empty-queue polls |
| `UB_SCHEDULER_BATCH` | `50` | — | no | Jobs claimed per tick |
| `UB_SCHEDULER_ENQUEUE_LOCK_ID` | `918273645` | — | no | Advisory-lock key for the periodic-enqueue step **only** (Part 20 §20.8.6.1 rule S2) |
| `UB_RATE_LIMIT_USER` | `600/min` | — | no | Part 22 §22.1 |
| `UB_RATE_LIMIT_OTP` | `5/10min` | — | no | |
| `UB_RATE_LIMIT_EXPORT` | `10/hour` | — | no | |
| `UB_DEFAULT_TIMEZONE` | `Asia/Kolkata` | — | no | Business-date boundary; tenant-overridable |
| `UB_DEFAULT_LOCALE` | `en` | — | no | |
| `UB_SUPER_ADMIN_MOBILES` | *(empty)* | no | no | Bootstrap only; ignored when `UB_ENV_NAME=production` |
| `UB_FEATURE_FLAGS` | `{}` | no | no | Global kill-switches, e.g. `{"public_links": false}` |
| `UB_VERSION` | `dev` | yes | no | Build/commit id, returned by `/system/version` and stamped on logs |
| `UB_E2E_MODE` | `0` | — | no | Enables the test-only OTP endpoint; asserted `0` in production |
| `UB_ALLOW_PARTNER_HEADER` | `0` | — | no | `X-UB-Partner` acceptance; asserted `0` in production (Part 24 §24.3.1) |
| `MSG91_<PARTNER>` / `WA_<PARTNER>` / `SMTP_<PARTNER>` | *(unset)* | — | **yes** | Per-partner credentials referenced by `credentials_ref` (Part 24 §24.7.1); absent ⇒ channel `skipped`. Exempt from the prefix rule because the suffix is partner data |

**Third-party variables, unprefixed by requirement:**

| Variable | Default | Secret | Read by | Meaning |
|---|---|---|---|---|
| `DJANGO_SETTINGS_MODULE` | `config.settings.local` | no | backend, scheduler, backup | One of the four modules named above |
| `POSTGRES_DB` | `udhaarbook` | no | db, backend, scheduler, backup | Database name |
| `POSTGRES_USER` | `udhaarbook` | no | db, backend, scheduler, backup | Role |
| `POSTGRES_PASSWORD` | *(none — required)* | **yes** | db, backend, scheduler, backup | Role password |
| `DATABASE_URL` | derived | **yes** | backend, scheduler | Composed in compose from the three above |
| `PG_SHARED_BUFFERS` | `1GB` | no | db | ~25 % of host RAM |
| `PG_EFFECTIVE_CACHE` | `3GB` | no | db | ~75 % of host RAM |
| `PG_WORK_MEM` | `16MB` | no | db | Per sort/hash |
| `PG_MAX_CONNECTIONS` | `100` | no | db | Must exceed workers × threads + scheduler + backup |
| `PG_SLOW_MS` | `500` | no | db | Slow-query log threshold |
| `GUNICORN_WORKERS` | `3` | no | backend | `2×vCPU+1` |
| `GUNICORN_TIMEOUT` | `60` | no | backend | Worker timeout (seconds) |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000/api/v1` | no | frontend (build arg) | Browser-side API base |
| `INTERNAL_API_BASE_URL` | `http://backend:8000/api/v1` | no | frontend (runtime) | Server-component fetches |
| `NEXT_PUBLIC_APP_NAME` | `DigiKhaato` | no | frontend (build arg) | Fallback product name before branding resolves |
| `BACKUP_DIR` | `/srv/backups` | no | backup | Dump destination |
| `BACKUP_HOUR_UTC` | `20` | no | backup | Daily dump hour |
| `BACKUP_KEEP_DAILY` / `_WEEKLY` | `30` / `12` | no | backup | Retention |
| `BACKUP_REMOTE_TARGET` | *(unset)* | no | backup | `rsync`/`scp` destination for off-host copies |
| `BACKUP_REMOTE_KEY` | *(unset)* | **yes** | backup | Path to the SSH key used for the off-host copy |
| `SUPERADMIN_IP_ALLOWLIST` | *(unset)* | no | nginx | CIDR list permitted to reach `/api/v1/admin/` |

Secret handling at this scale is specified in §29.8.5.

### 29.2.5 `backend/Dockerfile`

```dockerfile
# backend/Dockerfile — multi-stage; `dev` for local bind-mounted work, `runtime` for staging/prod.
FROM python:3.12-slim-bookworm AS base
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
# libpq for psycopg, libjpeg/zlib/freetype for Pillow, curl for healthchecks and ops
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 libjpeg62-turbo zlib1g libfreetype6 libwebp7 curl postgresql-client-16 \
    && rm -rf /var/lib/apt/lists/*

# ---------- dependency layer ----------
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential libpq-dev libjpeg-dev zlib1g-dev libfreetype6-dev libwebp-dev \
    && rm -rf /var/lib/apt/lists/*
COPY requirements/base.txt requirements/prod.txt /tmp/req/
RUN python -m venv /opt/venv && /opt/venv/bin/pip install -r /tmp/req/prod.txt

FROM deps AS deps-dev
COPY requirements/dev.txt /tmp/req/dev.txt
RUN /opt/venv/bin/pip install -r /tmp/req/dev.txt

# ---------- dev ----------
FROM base AS dev
COPY --from=deps-dev /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN useradd -u 1000 -m app && mkdir -p /srv/media /srv/static && chown -R app /srv/media /srv/static
USER app
EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

# ---------- runtime ----------
FROM base AS runtime
COPY --from=deps /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" DJANGO_SETTINGS_MODULE=config.settings.prod
RUN useradd -u 1000 -m app && mkdir -p /srv/media /srv/static && chown -R app /srv/media /srv/static
COPY --chown=app:app . /app
USER app
# Static files are collected at build time so the image is self-contained and the
# entrypoint does no work that could fail at boot.
RUN UB_SECRET_KEY=build-only DATABASE_URL=postgresql://u:p@db:5432/d \
    python manage.py collectstatic --noinput --clear
EXPOSE 8000
ENTRYPOINT ["/app/ops/entrypoint.sh"]
CMD ["gunicorn", "config.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "3", "--threads", "2", \
     "--timeout", "60", "--graceful-timeout", "30", "--keep-alive", "5", \
     "--max-requests", "1000", "--max-requests-jitter", "100", \
     "--access-logfile", "-", "--error-logfile", "-", \
     "--access-logformat", "%({x-request-id}i)s %(m)s %(U)s %(s)s %(L)s"]
```

```bash
#!/usr/bin/env sh
# backend/ops/entrypoint.sh — waits for the database, then hands over. It does NOT
# run migrations: migrations are an explicit, ordered deploy step (§29.6), never a
# side effect of a container restart, because two containers starting together
# would race and because a failed migration must stop the deploy, not crash-loop.
set -eu
: "${DATABASE_URL:?DATABASE_URL required}"
echo "{\"event\":\"entrypoint.wait_for_db\",\"service\":\"${SERVICE_ROLE:-backend}\"}"
for i in $(seq 1 60); do
  if python -c "import sys,psycopg; psycopg.connect('${DATABASE_URL}', connect_timeout=3).close()" 2>/dev/null; then
    echo '{"event":"entrypoint.db_ready"}'; exec "$@"
  fi
  sleep 2
done
echo '{"event":"entrypoint.db_unavailable","level":"CRITICAL"}' >&2
exit 1
```

### 29.2.6 `frontend/Dockerfile`

```dockerfile
# frontend/Dockerfile — Next.js 16 standalone output.
# next.config.js must set `output: 'standalone'` for the runtime stage to work.
FROM node:20-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ---------- dependencies ----------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---------- dev ----------
FROM base AS dev
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=development
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ---------- build ----------
FROM base AS build
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_APP_NAME
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME \
    NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build          # next build → .next/standalone + .next/static

# ---------- runtime ----------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
WORKDIR /app
RUN useradd -u 1001 -m next
COPY --from=build --chown=next:next /app/.next/standalone ./
COPY --from=build --chown=next:next /app/.next/static ./.next/static
COPY --from=build --chown=next:next /app/public ./public
USER next
EXPOSE 3000
CMD ["node", "server.js"]
```

Two notes that are easy to get wrong and are therefore stated:

- `NEXT_PUBLIC_*` values are **baked at build time**. Changing the public API URL requires a rebuild, not a restart. This is why `PUBLIC_BASE_URL` (server-side, runtime) and `NEXT_PUBLIC_API_BASE_URL` (client-side, build-time) are separate variables.
- The standalone runtime image contains no `node_modules` tree beyond what the tracer included, and no build toolchain. Image sizes at MVP: backend ≈ 280 MB, frontend ≈ 180 MB.

---

## 29.3 The scheduler service

### 29.3.1 What it is

ADR-012 replaces Celery and Redis with a table and a loop. `platform_job` rows are written by `jobs.enqueue(task, payload, run_at=None)`; `manage.py run_scheduler` drains them and also fires time-based work that has no enqueuing caller (reminders, overdue refresh, low-stock scan, hostname verification, snapshot refresh, attachment GC, certificate expiry check).

```
platform_job:
  id uuid pk, tenant_id uuid NULL, kind varchar(48), payload jsonb,
  run_at timestamptz NN default now(), status varchar(12) NN default 'queued'
      ∈ {queued, running, done, failed, cancelled},
  attempts smallint NN default 0, max_attempts smallint NN default 3,
  locked_at timestamptz NULL, locked_by varchar(64) NULL, lease_until timestamptz NULL,
  last_error text NULL, result jsonb NULL, created_at, started_at, finished_at
IX(status, run_at) WHERE status = 'queued'; IX(tenant_id, created_at DESC); IX(kind, status)
```

### 29.3.2 Invocation

Two modes, one command:

```bash
# Container mode (compose `scheduler` service) — a supervised loop.
python manage.py run_scheduler --loop --interval 60 --batch 50

# Cron mode (bare-metal or a host without a long-running container) — one tick.
* * * * * cd /srv/udhaarbook && docker compose exec -T scheduler \
          python manage.py run_scheduler --once --batch 50 >> /var/log/ub-scheduler.log 2>&1
```

The loop mode is the default because it avoids a process start per minute and because Docker's `restart: unless-stopped` supervises it for free. Cron mode exists so the same code runs unchanged on a host where a long-running container is undesirable, and is what the local developer uses when they want deterministic ticks.

A tick does, in order (the concurrency model behind these steps is Part 20 §20.8.6.1, which owns it; this is the operational view of it):

1. Reclaim **expired leases**: rows `status='running'` with `lease_until < now()` return to `queued` with `attempts` already incremented — this is what recovers from a killed runner.
2. Try the **enqueue advisory lock**, non-blocking (§29.3.3). If held, enqueue the **due periodic tasks** from the registry in Part 20 §20.8.4, deduplicated on `scheduled_key`; then release it immediately. If not held, skip this step and continue — **never return early**, because another runner is doing the enqueueing and this one still has jobs to drain.
3. Claim up to `--batch` queued jobs where `run_at <= now()`, ordered by `priority, run_at`, using `SELECT … FOR UPDATE SKIP LOCKED`, and set `status='running'`, `locked_by=<hostname:pid>`, `lease_until=now() + interval '10 minutes'`.
4. Execute each claimed job inside its own `transaction.atomic()` with its own error boundary, **holding no scheduler-wide lock**: a failure marks that job `failed` (or re-queues with backoff) and does not abort the batch, and a ninety-second export blocks nothing.
5. Write the heartbeat: a `platform_job` row of kind `scheduler.heartbeat` with `status='done'` and `finished_at=now()`, which is the health signal. It is written by the tick itself and has no handler in the §20.8.4 registry.

**Periodic schedule.** There is one job registry and one schedule for this product, and it is **Part 20 §20.8.4** (Part 0 §0.12; Part 42 CF-13). This chapter no longer keeps a second list: the two had diverged into different names (`ledger.reminders_due` against `ledger.schedule_auto_reminders`, `files.gc` against `files.gc_orphans`) and different times for the same work, and an implementer had no way to tell which was meant. Part 20's names and times win; the jobs this chapter used to name and Part 20 did not — hostname verification, partner usage, entitlement reconcile, export expiry, notification purge, certificate check, backup verification — have been merged into that table under their Part 20 names.

*Excerpt from Part 20 §20.8.4 — that table is authoritative — showing only the entries an operator is most often asked about:*

| Task | Schedule (IST) | `job_type` |
|---|---|---|
| Reminder dispatch D-1 / D0 | daily 08:00 | `ledger.schedule_auto_reminders` |
| Overdue status refresh | daily 00:15 | `sales.refresh_overdue`, `purchases.refresh_overdue` |
| Low-stock scan | daily 01:00 | `inventory.scan_low_stock` |
| **Invariant / drift check** | **daily 02:45** | **`platform.check_invariants`** |
| **Balance replay** | **daily 03:00** | **`parties.recalc_balances`** |
| **Stock replay** | **daily 03:10** | **`inventory.recalc_stock`** |
| **Missed-run detection** | **hourly** | **`platform.check_expected_runs`** |
| Backup verification | daily 04:15 | `ops.verify_backup` |

The four bold rows are the nightly correctness apparatus that NFR-40, goal G3 and the Part 12 §12.5 launch gate depend on and that neither chapter previously scheduled (Part 41 BE-03). What each compares, its runtime budget, that it reports rather than repairs, and the alerts it raises are Part 20 §20.11.5. Operationally: they run inside the nightly window after the backup dump, their reports are read through `GET /admin/jobs?job_type=platform.check_invariants`, a non-empty `violations` array raises `invariant.violated`, and the repair is an operator running `recalc_stock --fix` or `recalc_balances --fix` by hand — the jobs never write a correction themselves.

### 29.3.3 Locking — two schedulers never double-process

**The scheduler concurrency model is Part 20 §20.8.6.1** and is stated only there (Part 0 §0.12; Part 42 CF-13). This chapter states no model of its own; what follows is only how that model is configured on this deployment.

An earlier draft of this section wrapped the **whole tick** — including job execution — in a session advisory lock. That serialises the entire queue behind its slowest job: the ninety-second export of Part 28 §28.9.3 would block the reminder dispatch, the transaction SMS and every other tenant's work, and §28.9.1 P9's "drain a 1,000-job backlog in ≤ 60 s" becomes arithmetically impossible (Part 41 BE-04). It is corrected here rather than argued with.

**Deployment configuration:**

1. **The advisory lock is scoped to the periodic-enqueue step only** (rule S2), keyed by `UB_SCHEDULER_ENQUEUE_LOCK_ID`, taken non-blocking and released within the same tick. A second scheduler container, an accidental `--loop` in a terminal, or a cron tick overlapping a slow previous tick is therefore harmless — the extra runner skips the enqueue and goes on draining, which is the behaviour we actually want from it.
2. **Job claiming is `FOR UPDATE SKIP LOCKED` with a lease** (rule S1), so N runners already work today: `docker compose up -d --scale scheduler=2` needs no code change and no lock removal (§29.10 step 3 is now a scaling decision, not a redesign).
3. **Idempotency of the jobs themselves is the third defence.** Every job type is idempotent by construction: reminder dispatch is uniquely constrained on `(party_id, due_on, kind)`; message sends are keyed by the message-log row; snapshot refresh and both replays are pure recomputations. A duplicate execution costs cycles, never correctness. Asserted by the job tests (Part 28 §28.3.8).
4. **Absence is alerted, not just failure** (rule S4): `platform.check_expected_runs` reports any scheduled run that has not succeeded within its grace window, so a night on which the scheduler simply did not run is loud.

### 29.3.4 Health signal and failure behaviour

**Health.** `manage.py scheduler_health --max-age 300` exits `0` when the newest `scheduler.heartbeat` row is younger than the threshold, `1` otherwise. It is the container healthcheck, and it is also exposed to operators through `GET /api/v1/system/health`, which returns:

```json
{ "data": { "status": "ok",
    "checks": { "database": "ok",
                "migrations": "applied",
                "scheduler": { "status": "ok", "last_tick_seconds_ago": 42, "queued": 3, "failed_24h": 0 },
                "media": { "writable": true, "free_mb": 48211 },
                "version": "1.4.2", "commit": "9f3ac1e" } } }
```

`status` is `degraded` when the scheduler is stale, the queue exceeds 500, or `failed_24h` exceeds 10; `error` when the database is unreachable. The endpoint is unauthenticated and shallow (Part 22 §22.12), so it must not reveal tenant counts or names — only the shape above.

**Failure behaviour, by layer:**

| Failure | Behaviour |
|---|---|
| A single job raises | Caught; `attempts += 1`; if `attempts < max_attempts`, re-queued with `run_at = now() + 2^attempts minutes` (2, 4, 8); else `status='failed'` with `last_error`. The batch continues |
| A job exceeds its lease | Lease reclaimed on a later tick; the job's own idempotency prevents a duplicate effect |
| A tick raises outside a job | Logged at ERROR with the traceback and `request_id`-equivalent tick id; the loop sleeps and continues; the container is not restarted (a restart loses nothing but achieves nothing) |
| The process is killed | `stop_grace_period: 60s` lets an in-flight job finish; anything unfinished is reclaimed by lease expiry |
| The database is unreachable | Tick logs CRITICAL and returns; the loop retries at the next interval; the healthcheck fails after 3 checks and Docker restarts the container |
| The queue backs up | `/system/health` reports `degraded`; the runbook in §29.11.3 applies |
| A job is poisonous (fails every time) | After `max_attempts` it sits `failed` and is visible in `GET /admin/jobs?status=failed`; it never blocks other jobs because claiming is per row |

**What the scheduler must never do:** send a message twice for one logical event, post a ledger entry or stock movement (jobs orchestrate services; the services post), hold a transaction across jobs, or run migrations.

---

## 29.4 First run and bootstrap

### 29.4.1 From a clean clone to a working app

Exact sequence. Prerequisites: Docker Engine ≥ 24 with Compose v2, 8 GB RAM, 10 GB free disk, ports 3000/8000/5432 free.

```bash
# 1. Clone and enter
git clone <repo> udhaarbook && cd udhaarbook

# 2. Create the environment file and generate a key
cp .env.example .env
python3 -c "import secrets; print('UB_SECRET_KEY=' + secrets.token_urlsafe(64))" >> .env
python3 -c "import secrets; print('POSTGRES_PASSWORD=' + secrets.token_urlsafe(24))" >> .env
$EDITOR .env          # confirm TIME_ZONE, PUBLIC_BASE_URL, ports

# 3. Build the images (first build ≈ 4–7 min)
docker compose build

# 4. Start the database only, and wait for it to be healthy
docker compose up -d db
docker compose ps db            # expect: healthy

# 5. Run migrations (explicit — the entrypoint never does this)
docker compose run --rm backend python manage.py migrate

# 6. Seed reference data (idempotent; safe to re-run)
docker compose run --rm backend python manage.py seed_all
#   which runs, in dependency order:
#     seed_roles              system roles owner/admin/staff/accountant + permission sets
#     seed_plans              'free' and 'unlimited'
#     seed_partners           the 'metis' partner, default plan = unlimited locally
#     seed_units              GST UQC units (NOS, KGS, LTR, MTR, BOX, PCS, …)
#     seed_tax_rates          GST slabs with effective dates incl. the 2025-09-21 boundary
#     seed_expense_categories Rent, Salaries, Electricity, Transport, Food, Marketing, Fees, Other
#     seed_hsn                HSN/SAC master for search

# 7. Create the super admin (interactive: mobile, name, password)
docker compose run --rm backend python manage.py create_superadmin

# 8. Start everything
docker compose up -d

# 9. Watch it come up
docker compose ps                      # all services: healthy
docker compose logs -f backend scheduler | head -50

# 10. Open the app
open http://localhost:3000
```

Optional, for a populated demo or for E2E work:

```bash
docker compose run --rm backend python manage.py seed_demo      # one retail tenant, ~120 entries
docker compose run --rm backend python manage.py seed_e2e --reset
```

`seed_demo` refuses to run when `DEBUG=0` unless `--force` is passed, so demo parties can never appear in production.

### 29.4.2 What the first login does

The super admin created in step 7 is a platform operator, not a merchant. Signing in at `http://localhost:3000` with a *new* mobile number runs the onboarding wizard (PLT-03), which creates: the tenant under the `metis` partner with the `unlimited` plan, the owner membership, the default `MAIN` location, `platform_document_sequence` rows for the current financial year for every document kind, the tenant settings from the business-type preset, and the default tenant branding (empty, so everything resolves to product defaults).

### 29.4.3 Verification checklist

Every line must pass before the installation is considered working.

```bash
# Infrastructure
docker compose ps                                   # 4 services, all "healthy"
docker compose exec db pg_isready                   # accepting connections
curl -s localhost:8000/api/v1/system/health | jq    # status "ok", scheduler "ok", migrations "applied"
curl -s localhost:8000/api/v1/system/version | jq   # version + commit present

# Migrations and seeds
docker compose exec backend python manage.py migrate --check          # exits 0: nothing pending
docker compose exec backend python manage.py showmigrations | grep -c '\[ \]'   # 0
docker compose exec backend python manage.py shell -c \
  "from tax.models import TaxRate; print(TaxRate.objects.count())"    # > 0
docker compose exec backend python manage.py seed_all                 # re-run is a no-op

# Scheduler
docker compose exec scheduler python manage.py scheduler_health --max-age 300   # exits 0
docker compose logs scheduler --tail 20 | grep scheduler.tick                   # ticks visible

# Frontend
curl -sI localhost:3000 | head -1                   # HTTP 200
curl -s localhost:3000/api/healthz                  # ok
```

Then, in the browser, the functional checklist:

- [ ] Sign up with a mobile; the OTP appears in `docker compose logs backend` (console SMS backend)
- [ ] Complete onboarding; land on the dashboard with the product theme applied and no flash
- [ ] Create a party; record "You gave ₹500"; the balance shows ₹500 with the "You will get" label in red tone
- [ ] Create an item with opening stock; create and issue an invoice; the number follows the series; stock decreases; the party balance increases
- [ ] Open the invoice print view; the branding and totals render; the browser print dialog offers Save as PDF
- [ ] Record a payment; the invoice becomes partially paid; the statement shows both rows with a correct running balance
- [ ] Switch the language to Hindi; the primary screens are translated
- [ ] Settings → Branding: upload a logo, set a colour, confirm the theme changes live and a low-contrast colour is rejected with a suggestion
- [ ] Stop and start everything (`docker compose down && docker compose up -d`); all data is still present

---

## 29.5 Database operations

### 29.5.1 Backups on a single machine

The whole of the merchant's business is in one PostgreSQL database on one disk. The backup strategy is therefore the most important operational content in this chapter, and it is deliberately boring: `pg_dump`, on a schedule, verified, with a copy off the machine.

**Schedule and retention.** The `backup` service runs `ops/backup/loop.sh`, which sleeps until `BACKUP_HOUR_UTC` and then:

```bash
#!/usr/bin/env bash
# ops/backup/run.sh — one backup cycle.
set -euo pipefail
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DAY=$(date -u +%Y%m%d)
OUT="${BACKUP_DIR}/daily/ub-${STAMP}.dump"
mkdir -p "${BACKUP_DIR}/daily" "${BACKUP_DIR}/weekly" "${BACKUP_DIR}/media"

# 1. Custom-format dump: compressed, parallel-restorable, selective-restorable.
pg_dump -h db -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
        --format=custom --compress=9 --no-owner --no-privileges \
        --file="${OUT}.tmp"
mv "${OUT}.tmp" "${OUT}"                       # atomic: a partial file is never named .dump
sha256sum "${OUT}" > "${OUT}.sha256"

# 2. Media: incremental hard-link snapshot (cheap; media is append-mostly).
rsync -a --delete --link-dest="${BACKUP_DIR}/media/latest" \
      /srv/media/ "${BACKUP_DIR}/media/${DAY}/"
ln -sfn "${BACKUP_DIR}/media/${DAY}" "${BACKUP_DIR}/media/latest"

# 3. Verify by restoring into a throwaway database and counting rows.
createdb -h db -U "${POSTGRES_USER}" "verify_${DAY}"
pg_restore -h db -U "${POSTGRES_USER}" -d "verify_${DAY}" --no-owner --jobs=2 "${OUT}"
psql -h db -U "${POSTGRES_USER}" -d "verify_${DAY}" -tAc \
  "SELECT count(*) FROM ledger_entry" > "${OUT}.verify"
dropdb -h db -U "${POSTGRES_USER}" "verify_${DAY}"

# 4. Weekly promotion (Sundays) and retention.
[ "$(date -u +%u)" = "7" ] && cp -l "${OUT}" "${BACKUP_DIR}/weekly/"
find "${BACKUP_DIR}/daily"  -name '*.dump' -mtime "+${BACKUP_KEEP_DAILY}"        -delete
find "${BACKUP_DIR}/weekly" -name '*.dump' -mtime "+$((BACKUP_KEEP_WEEKLY * 7))" -delete
find "${BACKUP_DIR}/media"  -maxdepth 1 -type d -mtime "+${BACKUP_KEEP_DAILY}"   -exec rm -rf {} +

# 5. Off-host copy (the only step that protects against losing the machine).
[ -n "${BACKUP_REMOTE_TARGET:-}" ] && \
  rsync -az -e "ssh -i ${BACKUP_REMOTE_KEY} -o StrictHostKeyChecking=yes" \
        "${OUT}" "${OUT}.sha256" "${BACKUP_REMOTE_TARGET}/"
echo "{\"event\":\"backup.done\",\"file\":\"${OUT}\",\"bytes\":$(stat -c%s "${OUT}")}"
```

| Property | Value | Reasoning |
|---|---|---|
| Frequency | Daily, 01:30 IST | Post-midnight, pre-dawn; the shop is closed |
| Format | `pg_dump --format=custom` | Compressed, selective restore, parallel `pg_restore` |
| Retention | 30 daily + 12 weekly | ~10 months of history at a few hundred MB per dump |
| Media | Hard-link snapshots | Near-zero incremental cost for append-mostly files |
| Verification | Restore + row count, **every night** | An unverified backup is a hypothesis |
| Off-host | `rsync` over SSH to a second host or a mounted object store | Protects against disk and machine loss |
| Encryption at rest | The remote target's responsibility at MVP; `age`/`gpg` when a partner requires it (needs an ADR only if a library is added) | |
| RPO | 24 hours at MVP | Accepted for a single-machine deployment; reduced by §29.5.4 |
| RTO | ≤ 30 minutes | The restore drill measures it |

**The restore drill is mandatory and scheduled: once a month, on staging, against the newest production dump.** An operator follows §29.11.7 end to end and records the elapsed time and any deviation. A backup strategy that has never been restored is a belief, and this drill is what converts it into a fact. The drill also verifies the media snapshot by opening three random attachments in the restored environment.

### 29.5.2 Migration execution during a deploy

**Part 29 owns the position of migration execution in the deploy sequence** (Part 0 §0.12; Part 42 CF-13), and Part 20 §20.13.5 now defers to it: the container entrypoint waits for the database and then execs its command, nothing more.

Migrations are an **explicit, ordered step**, never a container-start side effect. The order in §29.6 is: build → migrate → restart backend → restart scheduler → restart frontend. The reasons are specific:

1. Two containers starting concurrently would both attempt `migrate` and race on the migration table.
2. A failed migration must stop the deploy with a clear error, not produce a crash-looping container that masks the cause.
3. The old code must be able to run against the new schema for the few seconds between migrate and restart — which is precisely the zero-downtime rule below.

### 29.5.3 Zero-downtime rules

Every migration must satisfy: **the currently running code keeps working against the new schema, and the new code works against the old schema for the duration of the rollout.** This is the expand/contract discipline, and it is not optional even on a single-server deployment, because it is what makes a rollback survivable.

| Change | How |
|---|---|
| Add a column | Nullable or with a database default. **Never** `NOT NULL` without a default in one step |
| Make a column `NOT NULL` | Three releases: (1) add nullable + write it in code; (2) backfill in batches via a management command; (3) add `CHECK … NOT VALID`, `VALIDATE CONSTRAINT`, then `SET NOT NULL` |
| Rename a column | Never rename. Add the new one, dual-write, backfill, switch reads, drop the old one a release later |
| Drop a column | Only after a release in which no code references it. The drop is its own migration |
| Add an index | `AddIndexConcurrently` in an `atomic = False` migration |
| Add a unique constraint | Create the index `CONCURRENTLY`, then add the constraint `USING INDEX` |
| Change a column type | Add new, dual-write, backfill, switch, drop |
| Add a foreign key | `NOT VALID` first, then `VALIDATE CONSTRAINT` in a separate migration |
| Data migration | Separate file from the schema migration; batched (≤ 5,000 rows per transaction); resumable; reversible or explicitly `noop` |
| Drop a table | Two releases: stop using it, then drop |

`ACCESS EXCLUSIVE` locks are the enemy: on this deployment they are brief because the tables are small, but the discipline is established now because it cannot be retrofitted once a table has ten million rows. A migration that would hold such a lock on `ledger_entry`, `inventory_stock_movement`, `sales_document` or `platform_audit_log` is rejected in review.

### 29.5.4 Point-in-time recovery — the upgrade path

At MVP, recovery granularity is the nightly dump (RPO 24 h). This is honest for a single-user local deployment and thin for a production one. The upgrade, taken when the first partner goes live or when tenant count crosses ~200:

1. **Enable WAL archiving.** `wal_level=replica` is already set (§29.2.3). Add `archive_mode=on` and `archive_command='test ! -f /srv/wal/%f && cp %p /srv/wal/%f'`, with `/srv/wal` on the backup volume and rsynced off-host by the same loop.
2. **Take a base backup weekly.** `pg_basebackup -D /srv/basebackup/$(date +%F) -Ft -z -Xs -P`.
3. **Retain** the base backup plus every WAL segment since it. Prune with `pg_archivecleanup` against the oldest retained base.
4. **Recover** by restoring the base backup and setting `recovery_target_time` in `postgresql.auto.conf` with `restore_command` pointing at the archive.
5. **Drill** the PITR path quarterly, recovering to a timestamp five minutes before a known event.

RPO falls from 24 hours to the WAL archive interval (minutes). Nothing in the application changes; this is a database configuration and an ops process, which is exactly why the schema and the deployment were shaped this way.

---

## 29.6 Deployment procedure

### 29.6.1 Build and release

```bash
# ── On the build host (CI or the developer machine) ────────────────────────────
git tag -a v1.4.2 -m "Release 1.4.2" && git push --tags
docker compose -f docker-compose.yml -f docker-compose.prod.yml build \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://app.udhaarbook.in/api/v1
docker tag udhaarbook-backend:latest  registry.example.com/ub-backend:v1.4.2
docker tag udhaarbook-frontend:latest registry.example.com/ub-frontend:v1.4.2
docker push registry.example.com/ub-backend:v1.4.2
docker push registry.example.com/ub-frontend:v1.4.2
```

Where there is no registry (the solo phase), the images are built on the server from a pinned tag — slower, and acceptable while there is one server. The artefact is always an **immutable tagged image**, never `latest` in production, so a rollback is a tag change.

### 29.6.2 Release steps, in order

```bash
# ── On the server, as the deploy user ─────────────────────────────────────────
cd /srv/udhaarbook
export COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

# 1. PRE-FLIGHT — never skipped
$COMPOSE ps                                                   # everything healthy now?
curl -sf https://app.udhaarbook.in/api/v1/system/health | jq -e '.data.status=="ok"'
ls -la /srv/udhaarbook/backups/daily | tail -3                # last night's dump exists and verified
df -h /srv/udhaarbook                                         # > 20 % free
git -C /srv/udhaarbook log --oneline -1                       # note the current commit for rollback

# 2. TAKE AN IMMEDIATE BACKUP (in addition to the nightly)
$COMPOSE exec -T backup /app/ops/backup/run.sh

# 3. FETCH THE NEW CODE AND IMAGES
git fetch --tags && git checkout v1.4.2
$COMPOSE pull                                                 # or: $COMPOSE build

# 4. MIGRATE — explicit, before any container restart
$COMPOSE run --rm backend python manage.py migrate --noinput
# a non-zero exit stops the deploy here; nothing has been restarted

# 5. SEED (idempotent; picks up new reference data such as a tax-rate change)
$COMPOSE run --rm backend python manage.py seed_all

# 6. ROLL THE SERVICES, in dependency order
$COMPOSE up -d --no-deps backend       # gunicorn drains with --graceful-timeout 30
$COMPOSE up -d --no-deps scheduler     # after backend, so jobs meet the new code
$COMPOSE up -d --no-deps frontend
$COMPOSE up -d --no-deps nginx         # only if the nginx config changed

# 7. SMOKE TEST (§29.6.3)
./ops/smoke.sh https://app.udhaarbook.in

# 8. RECORD
echo "$(date -uIs) v1.4.2 $(git rev-parse --short HEAD) deployed by $USER" >> ops/DEPLOY_LOG
```

Downtime: the backend is unavailable for 5–15 seconds while gunicorn restarts, and the frontend for a similar window. nginx returns 502 during that gap; a `proxy_next_upstream` retry and a 5-second `proxy_connect_timeout` hide most of it. True zero downtime needs two backend replicas behind nginx and is §29.10 step 2 — deliberately not done on day one, because a 15-second window at 02:00 IST is cheaper than the complexity.

### 29.6.3 Smoke tests

`ops/smoke.sh` — run after every deploy, exits non-zero on any failure:

```bash
#!/usr/bin/env bash
set -euo pipefail
BASE="${1:?usage: smoke.sh <base-url>}"
fail() { echo "SMOKE FAIL: $*" >&2; exit 1; }

curl -sf "$BASE/api/v1/system/health" | jq -e '.data.status=="ok"'           || fail health
curl -sf "$BASE/api/v1/system/health" | jq -e '.data.checks.migrations=="applied"' || fail migrations
curl -sf "$BASE/api/v1/system/health" | jq -e '.data.checks.scheduler.status=="ok"' || fail scheduler
curl -sf "$BASE/api/v1/system/version" | jq -e --arg v "$EXPECTED_VERSION" '.data.version==$v' || fail version
[ "$(curl -so /dev/null -w '%{http_code}' "$BASE/")" = "200" ]                || fail frontend
[ "$(curl -so /dev/null -w '%{http_code}' "$BASE/login")" = "200" ]           || fail login-page
curl -sf "$BASE/api/v1/public/branding?host=app.udhaarbook.in" | jq -e '.data.app_name' || fail branding
[ "$(curl -so /dev/null -w '%{http_code}' "$BASE/api/v1/parties")" = "401" ]  || fail auth-required
curl -sfI "$BASE/static/$(cat ops/smoke-static-asset)" | grep -q '200'        || fail static
curl -sf "$BASE/api/v1/system/health" -H 'X-Request-Id: smoke-1' -D- -o/dev/null \
  | grep -qi 'x-request-id: smoke-1'                                          || fail request-id
echo "SMOKE OK"
```

Then a two-minute manual pass: log in as a test tenant, open the dashboard, open a party's statement, open one invoice's print view. Automated checks prove the stack is up; the manual pass proves it is *right*.

### 29.6.4 Rollback

```bash
# Code-only rollback (no migration in the release) — 60 seconds
cd /srv/udhaarbook
git checkout v1.4.1
$COMPOSE up -d --no-deps backend scheduler frontend
./ops/smoke.sh https://app.udhaarbook.in
```

**With a migration in the release**, the rollback is not symmetric, and this is the single most dangerous moment in the whole chapter. The decision tree:

1. **The migration was expand-only** (added a nullable column, added an index, added a table) — the old code is unaffected. Roll back the code, leave the schema forward. This is the normal case and it is why §29.5.3 exists.
2. **The migration was contract** (dropped or renamed something) — the old code will break. Do **not** reverse-migrate under load. Either roll forward with a fix, or restore from the pre-deploy backup taken in step 2 and accept the loss of transactions since the deploy. Which is why step 2 is not optional.
3. **A data migration transformed rows** — reversing the schema does not reverse the data. The reverse function, if one exists, is tested (Part 28 §28.3.7) but is a last resort; the backup is the primary path.

Rules written into the release checklist:

- A release containing a contract migration is deployed **alone**, never bundled with feature work, and is announced in the deploy log with the rollback plan stated in advance.
- The pre-deploy backup's verification output is checked *before* the migrate step, not after.
- The maximum tolerated rollback window is one release; anything older is a restore, not a rollback.

---

## 29.7 Media and static files

### 29.7.1 Layout

`MEDIA_ROOT=/srv/media` (volume `ub_media`), organised so that a tenant's files are contiguous — which makes per-tenant export (PLT-10), per-tenant deletion and a future object-storage migration all trivial:

```
/srv/media/
  tenants/<tenant_id>/
    logo/<attachment_id>.<ext>
    signature/<attachment_id>.<ext>
    items/<attachment_id>.<ext>            # item images, resized to ≤ 1024 px
    bills/<yyyy>/<mm>/<attachment_id>.<ext>  # bill photos and receipts, date-partitioned
    imports/<attachment_id>.csv
    exports/<attachment_id>.<csv|xlsx>     # TTL 7 days
    documents/<attachment_id>.pdf          # cached renders (P2)
  partners/<partner_id>/
    logo/<attachment_id>.<ext>
    favicon/<attachment_id>.png
    fonts/<attachment_id>.woff2            # WLB-05
  tmp/                                     # in-flight uploads; swept by files.gc_orphans
```

Rules: the filename is the attachment UUID, so nothing user-supplied ever reaches the filesystem; the original name lives in `files_attachment.original_name`; `sha256` is stored for deduplication and integrity; images are re-encoded through Pillow on upload, which strips EXIF and any embedded payload; SVG is rejected (Part 24 §24.8.4); the per-file cap is `MEDIA_MAX_UPLOAD_MB`.

### 29.7.2 Static files

`collectstatic` runs at **image build time** (§29.2.5), so `/srv/static` is populated by the image and served by nginx directly. `ManifestStaticFilesStorage` hashes filenames, so static assets are served `immutable` with a one-year max-age. Next.js assets are served by the Next runtime under `/_next/`, with nginx passing them through and adding the same cache headers.

### 29.7.3 nginx serving rules

```nginx
# ops/nginx/conf.d/app.conf (abridged to the rules that matter)
server {
    listen 443 ssl http2;
    server_name app.udhaarbook.in khata.examplebank.in;   # partner hosts appended by ops
    ssl_certificate     /etc/letsencrypt/live/$ssl_server_name/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$ssl_server_name/privkey.pem;

    client_max_body_size 12m;                 # MEDIA_MAX_UPLOAD_MB + headroom
    gzip on; gzip_types application/json text/css application/javascript image/svg+xml;

    # Static: hashed, immutable
    location /static/ {
        alias /srv/static/;
        expires 1y; add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Media: authenticated by the app. nginx serves the bytes only after Django
    # authorises the request via X-Accel-Redirect; direct /media/ is never public.
    location /media/ {
        internal;
        alias /srv/media/;
        add_header Cache-Control "private, max-age=86400";
    }

    # Public share links: token-checked by Django, which then X-Accel-Redirects
    location /p/  { proxy_pass http://backend:8000; include proxy_params; }
    location /d/  { proxy_pass http://backend:8000; include proxy_params; }

    location /api/ {
        proxy_pass http://backend:8000;
        include proxy_params;
        proxy_read_timeout 70s;               # > GUNICORN_TIMEOUT
        limit_req zone=api burst=40 nodelay;
    }

    location /api/v1/admin/ {                 # super-admin surface
        include /etc/nginx/conf.d/superadmin-allowlist.inc;   # from SUPERADMIN_IP_ALLOWLIST
        deny all;
        proxy_pass http://backend:8000;
        include proxy_params;
    }

    location / {
        proxy_pass http://frontend:3000;
        include proxy_params;
    }
}
```

The `internal` + `X-Accel-Redirect` pattern is the important one: **no uploaded file is ever reachable without Django deciding it should be.** A merchant's bill photo is not a guessable URL. Public document pages work because Django validates the share token and *then* emits the redirect, with a short-lived signed path for the logo (Part 24 §24.7.3).

### 29.7.4 The object-storage seam

Django's storage API is the seam and it is already in place (ADR-013). Migrating to S3-compatible storage later is:

1. Add `django-storages` + `boto3` (an ADR, because it is outside the ADR-021 allow-list).
2. Set `DEFAULT_FILE_STORAGE` and the bucket settings in one environment.
3. Copy `/srv/media` to the bucket preserving the path layout above (`aws s3 sync`), which works precisely because the layout is already bucket-shaped.
4. Swap `X-Accel-Redirect` for presigned URLs in the one place attachments are served (`files/views.py`), behind the same permission check.

Nothing else changes: no model change, no path change, no per-feature change. Application code never constructs a filesystem path — it uses `attachment.file.url` and `attachment.file.open()` — and a lint check asserts that `open(`, `os.path.join(MEDIA_ROOT` and `Path(settings.MEDIA_ROOT)` do not appear outside the files app.

---

## 29.8 Security hardening of the deployment

### 29.8.1 TLS

- TLS 1.2 and 1.3 only; TLS 1.0/1.1 and all SSLv3 disabled. Cipher suite: the Mozilla "intermediate" list, pinned in `ops/nginx/nginx.conf` with a dated comment so it is reviewed annually.
- OCSP stapling on; `ssl_session_cache shared:SSL:10m`; `ssl_session_tickets off`.
- Certificates from Let's Encrypt via certbot in a sidecar using the HTTP-01 challenge served from `/var/www/acme` (the only unauthenticated path nginx serves from disk). Renewal runs twice daily and reloads nginx on success. The daily `ops.check_certificates` job warns at 21 days (§29.3.2), so a silent renewal failure is caught with three weeks of margin.
- HTTP redirects to HTTPS unconditionally in production, with the single exception of `/.well-known/acme-challenge/`.
- Partner custom domains get their own certificate per §24.5.2; adding one is an ops step, and the runbook requires the smoke test to be re-run for that host.

### 29.8.2 Response headers

Set once in nginx and asserted by a deploy smoke check:

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;                  # no embedding at MVP; OEM embedding (P3) needs a per-partner CSP frame-ancestors
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(self), microphone=(), geolocation=(), payment=()" always;
add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: blob:; \
  style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; \
  connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
```

`style-src 'unsafe-inline'` is required by the server-injected theme block (Part 24 §24.4.5) and by Tailwind's runtime-free but inline-variable approach; it is narrowed to a nonce in Phase 2. `camera=(self)` is present because barcode scanning (INV-10) needs `getUserMedia`. `script-src` has no `'unsafe-inline'` and no `'unsafe-eval'`, which Next.js in production satisfies.

### 29.8.3 Firewall and network posture

| Port | Exposure | Rule |
|---|---|---|
| 22 (SSH) | Restricted | Key-only, no password auth, no root login, source-IP restricted where the operator has a stable address; `fail2ban` on the auth log |
| 80 | Public | Redirect to 443 + ACME challenge only |
| 443 | Public | The application |
| 5432 (Postgres) | **Never published** | No `ports:` entry in the production overlay; reachable only on the compose bridge network |
| 8000 (backend), 3000 (frontend) | **Never published** | Reachable only through nginx |

`ufw` default-deny inbound, allow 22/80/443. Docker publishes ports by writing iptables rules that bypass ufw, which is a well-known trap: the production overlay therefore publishes nothing except through nginx, and a deploy check asserts `docker compose ps --format json` shows no published ports other than nginx's.

Outbound is unrestricted at MVP (the application makes outbound calls only to messaging providers when configured); when a partner requires it, outbound is allow-listed to the provider endpoints.

### 29.8.4 PostgreSQL access rules

- The database container publishes no port and is on the compose network only.
- Two roles: `udhaarbook` (owner, used by the application and by migrations) and `udhaarbook_backup` (read-only, used by the backup service). The split exists so a compromised backup path cannot write.
- `pg_hba.conf` (via `ops/postgres/init`) permits `scram-sha-256` from the compose subnet only; `trust` and `md5` appear nowhere.
- `log_min_duration_statement=500` gives a slow-query log without a profiler.
- `pg_stat_statements` is preloaded for the performance work in Part 28 §28.9.
- No superuser access from the application role. Extensions (`pg_trgm`, `pg_stat_statements`) are created by the init script as the bootstrap superuser, once.
- Connection count: `PG_MAX_CONNECTIONS` must exceed `GUNICORN_WORKERS × threads + scheduler + backup + 5`. A connection pooler (PgBouncer) is §29.10 step 4, not day one.

### 29.8.5 Secrets without a vault

At this scale a vault is more risk than it removes — another service to run, another failure mode, another credential to protect the credentials. The posture:

1. Secrets live in a single `.env` file on the host, owned by root, mode `600`, outside the git working tree's tracked set (`.gitignore` plus a pre-commit hook that rejects any file containing `UB_SECRET_KEY=` or `POSTGRES_PASSWORD=` with a non-placeholder value).
2. Secrets are injected into containers as environment variables by compose. They are visible to `docker inspect` as root — accepted, because root on this host already owns the database volume.
3. **Secrets never enter: the image** (no `ENV UB_SECRET_KEY`, no `COPY .env`), **the logs** (the JSON formatter has a redaction filter for keys matching `password|secret|token|key|authorization|credential`), **the audit log** (Part 24 §24.6.5), or **an error page** (`UB_DEBUG=0` is asserted).
4. Partner messaging credentials follow the same pattern: the database stores `credentials_ref`, a variable *name*; the value is read from the environment at send time (Part 24 §24.7.1). A missing variable degrades to `skipped`, never to an exception and never to another partner's credentials.
5. Rotation: `UB_SECRET_KEY` rotation invalidates all sessions and all hostname-verification tokens, so it is a scheduled maintenance action with a re-verification step, documented in the runbook. Database password rotation is: change the role's password, update `.env`, roll `backend`, `scheduler`, `backup`.
6. A backup of `.env` lives in the operator's password manager, not in the backup volume — a dump and the key to decrypt the sessions should not travel together.
7. The upgrade path, when a team or a compliance requirement arrives: Docker secrets or SOPS-encrypted files committed to the repository with the key in a KMS. Both read into the same environment variables, so the application is unaffected.

### 29.8.6 Administrative access

- SSH is the only administrative channel. There is no web shell, no `/admin` Django admin exposed publicly (Django's admin is disabled entirely; the super-admin console is the DRF-backed `/api/v1/admin/*` surface, IP-allow-listed at nginx per §29.7.3).
- The deploy user is unprivileged, in the `docker` group, and owns `/srv/udhaarbook`. It cannot `sudo` without a password.
- Every `docker compose exec` into a running container for a production investigation is logged by shell history and noted in `ops/DEPLOY_LOG` with the reason — an operator convention, not a technical control, and it is stated so it can be followed.
- Reading a merchant's business data from `psql` is treated exactly as impersonation is: it requires a reason, it is recorded, and it is a last resort after the structured logs and the audit log have been exhausted. The product's promise that a partner cannot read the shop's book (Part 24) is worth nothing if the operator does it casually.

---

## 29.9 CI/CD

### 29.9.1 Pipeline stages

The full definition of what runs when, and what blocks a merge, is Part 28 §28.11. This section covers only the delivery half.

| Stage | Produces | Gate |
|---|---|---|
| Lint / types / AST checks | — | blocks merge |
| Backend tests + coverage | coverage report | blocks merge |
| Frontend tests + coverage + bundle size | coverage, bundle report | blocks merge |
| E2E smoke | traces on failure | blocks merge |
| Traceability | `build/traceability.json` | blocks merge |
| **Build images** (on merge to `main`) | `ub-backend:<sha>`, `ub-frontend:<sha>` | — |
| **Deploy to staging** (automatic on merge) | running staging | — |
| **Full E2E + perf on staging** | reports | blocks the release tag |
| **Tag** (manual) | `v<semver>`, images retagged | — |
| **Deploy to production** (manual, §29.6.2) | running production | smoke test |

### 29.9.2 Artefact strategy

- One image per service per commit, tagged with the **git SHA**, and retagged with the semver tag at release. `latest` exists only as a convenience for local builds and is never referenced by a production compose file.
- Images are immutable: a rebuild of the same SHA must produce a functionally identical image. `requirements/*.txt` and `package-lock.json` are fully pinned; base images are pinned to a digest in production (`python:3.12-slim-bookworm@sha256:…`) and refreshed deliberately, monthly, as its own PR with the full suite run against it.
- Build metadata (`version`, `commit`, `built_at`) is baked in as build args and returned by `GET /system/version`, which is what makes the deploy log verifiable.
- Retention: the last 20 images per service, plus every released tag, kept indefinitely.

### 29.9.3 The minimal viable pipeline for a solo developer

Four make targets and one workflow file. Everything runs on a single runner; the E2E stack is brought up by compose inside the job.

```makefile
check:    ## lint, types, AST checks, migration check
	black --check backend && isort --check backend && flake8 backend
	cd frontend && npx tsc --noEmit && npx eslint . && npx prettier --check .
	docker compose run --rm backend python manage.py makemigrations --check --dry-run

test:     ## fast bands
	docker compose run --rm backend pytest -m "not slow" --cov
	cd frontend && npx jest --coverage

e2e:      ## smoke only
	docker compose up -d && docker compose run --rm backend python manage.py seed_e2e --reset
	cd e2e && npx playwright test --grep @smoke

ci: check test e2e
	docker compose run --rm backend python manage.py build_traceability
```

Deployment in this phase is `git pull && make deploy` on the server, where `deploy` is §29.6.2 as a script with the pre-flight checks as hard preconditions. No registry, no orchestrator, no secrets manager.

### 29.9.4 What it becomes with a team

Add, in this order, and only when the trigger occurs:

| Addition | Trigger | Change |
|---|---|---|
| Parallel CI jobs | CI exceeds 15 minutes | Split backend/frontend/E2E into concurrent jobs |
| A container registry | Two or more environments deployed from CI | Push tagged images; production pulls instead of builds |
| A merge queue | Two or more people merging daily | Serialise merges, run the full suite on the queued result |
| Staging auto-deploy | A second person needs to see changes before release | Deploy every `main` build to staging |
| Preview environments | Design review becomes a bottleneck | Per-PR compose stack on a shared host |
| Signed images and an SBOM | A bank partner's security review | `cosign` + `syft` in the build stage |
| Blue/green production | Downtime becomes unacceptable | §29.10 step 2 |

Nothing in this list changes a test, a make target or the deploy order. That is the point of specifying the minimal pipeline as the same shape as the full one.

---

## 29.10 The scaling path

Ordered. Each step names the **trigger metric** that justifies it, so that none is taken early. Taking these out of order is how a two-person team ends up operating a platform instead of building a product.

| # | Change | Trigger metric | What it involves | What it does not change |
|---|---|---|---|---|
| **0** | Stay as specified | — | One VPS, one of each service | — |
| **1** | **Vertical scale** | Host CPU > 70 % sustained for an hour, or P95 API > 500 ms with query budgets still met, or Postgres cache hit ratio < 0.98 | Resize the VPS; raise `GUNICORN_WORKERS`, `PG_SHARED_BUFFERS`, `PG_EFFECTIVE_CACHE`, `PG_MAX_CONNECTIONS`. A single restart | Nothing. This is a configuration change and it buys a factor of 4–8 |
| **2** | **Two backend replicas behind nginx** | Deploy downtime becomes unacceptable, or a single worker pool saturates while the database is idle | `backend` scaled to 2 with `deploy.replicas`, nginx upstream with two entries, health-checked; rolling restart gives zero-downtime deploys | The scheduler stays at exactly one (its advisory lock already guarantees this). No application change |
| **3** | **Split the scheduler** | Job queue depth > 500 sustained, or a long job (a large export) delays time-critical jobs (reminders) | Run two scheduler services with `--kinds` filters: one for `notifications.*` and `ledger.*` (latency-sensitive), one for `reports.*` and `files.*` (throughput). Remove the global advisory lock; the per-row `FOR UPDATE SKIP LOCKED` lease already makes this safe | No job code changes. This is why claiming was written with `SKIP LOCKED` on day one |
| **4** | **Connection pooling** | Postgres connection count approaches `max_connections`, or connection setup shows in the latency profile | PgBouncer in transaction mode as a sidecar; `DATABASE_URL` points at it | Application code. Prepared-statement usage must be checked once |
| **5** | **Read replicas** | Read:write ratio > 10:1 **and** reporting queries measurably delaying writes (lock waits visible in `pg_stat_activity`) | Streaming replica; a Django database router sending `reports` selectors and export generation to the replica, everything else to the primary | Write paths. Replica lag must be tolerable for reports — which it is, because reports are already allowed 60 s staleness |
| **6** | **Object storage for media** | Media volume > 100 GB, or a second application host makes a shared filesystem necessary, or a partner requires geo-redundancy | §29.7.4: `django-storages` + `boto3` (an ADR), sync the tree, swap `X-Accel-Redirect` for presigned URLs | The path layout, the models, the permission checks |
| **7** | **A real queue** | Jobs needing sub-second dispatch, or fan-out to many workers across hosts, or a genuine need for retries with priorities beyond what a table provides | Replace the runner behind `jobs.enqueue()` with Celery + a broker. Callers are unchanged, because `enqueue(task, payload)` was the interface from day one (ADR-012) | Every call site. This is the single most valuable deferral in the architecture |
| **8** | **Partitioning** | `platform_audit_log` or `notifications_message_log` exceeds ~50 M rows, or their vacuum time becomes disruptive | Monthly range partitions on `created_at`; the partition keys were chosen in Part 21 §21.9 | Queries, which already filter by `tenant_id` and a date range |
| **9** | **Row-level security** | A partner's security review requires defence in depth beyond the application's scoped manager | Enable RLS policies keyed on `current_setting('app.tenant_id')`; the schema was designed for this (Part 21 §21.1) | The scoped manager stays; RLS is additive |
| **10** | **Kubernetes** | Multiple hosts, multiple regions, or a partner contractually requiring it (Part 0 ADR-019 places this at Phase 3) | Manifests in the BrandHub `k8s-files` style; the images and the process model are already correct | The images, the health checks, the scheduler's singleton requirement (becomes a `Deployment` with `replicas: 1` and a leader election, or a `CronJob`) |

Two rules govern the whole list. **First: measure before moving.** Each trigger is a number obtainable from `/system/health`, `pg_stat_statements`, `docker stats` or the nightly `perf_probe` — no step is taken on intuition. **Second: never skip step 1.** Vertical scaling is unfashionable and it is almost always the correct first answer for a product whose entire data set for hundreds of tenants fits comfortably in RAM.

---

## 29.11 Runbooks

Each runbook is numbered steps, executable by someone who did not write the system, at 2 a.m. All assume `cd /srv/udhaarbook` and `export COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"`.

### 29.11.1 App down (users see 502 or a blank page)

1. `curl -s -o /dev/null -w '%{http_code}' https://app.udhaarbook.in/` — note the code. 502/504 ⇒ a backend or frontend problem; connection refused ⇒ nginx or the host.
2. `$COMPOSE ps` — which service is not `healthy`?
3. `$COMPOSE logs --tail 200 <service>` — read the last error before the failure.
4. If `backend` is unhealthy: `curl -s localhost:8000/api/v1/system/health` from the host. Database unreachable ⇒ §29.11.2. Migrations pending ⇒ §29.11.5.
5. If a container is restart-looping: `$COMPOSE ps` shows the restart count; `docker inspect <container> --format '{{.State.ExitCode}}'`. Exit 137 ⇒ OOM ⇒ check `free -m` and the memory limits; raise the limit or scale the host.
6. Restart the single failing service: `$COMPOSE up -d --force-recreate --no-deps <service>`. Wait 60 s and re-check health.
7. If still down and the last deploy was recent, roll back: §29.6.4.
8. If the host itself is the problem (`df -h` full ⇒ §29.11.4; load average high ⇒ identify the process with `top`), address that first.
9. When recovered, run `./ops/smoke.sh https://app.udhaarbook.in` and record the incident with the timeline in `ops/INCIDENTS.md`.

### 29.11.2 Database down

1. `$COMPOSE ps db` and `$COMPOSE logs --tail 200 db`.
2. `$COMPOSE exec db pg_isready -U udhaarbook` — if it answers, the problem is connectivity or connection exhaustion, not the server: go to step 6.
3. Container exited: check the exit code. Disk full ⇒ §29.11.4 first — **do not restart Postgres on a full disk.**
4. Corruption in the log (`PANIC`, `invalid page header`): **stop.** Do not restart repeatedly. Take a filesystem copy of the data directory, then go to §29.11.7 (restore from backup).
5. Otherwise restart: `$COMPOSE up -d db`, wait for `healthy`, then `$COMPOSE restart backend scheduler`.
6. Connection exhaustion: `$COMPOSE exec db psql -U udhaarbook -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state"`. Many `idle in transaction` ⇒ an application bug holding a transaction; identify with `SELECT pid, query, state_change FROM pg_stat_activity WHERE state='idle in transaction' ORDER BY state_change` and terminate with `pg_terminate_backend(pid)`; then fix the code path.
7. Long-running lock: `SELECT * FROM pg_locks l JOIN pg_stat_activity a USING (pid) WHERE NOT granted;` — terminate the blocker if it is a report or an export, never a write.
8. After recovery, run `manage.py check_integrity` (which re-runs the §28.2.5 recompute comparisons read-only) and confirm no balance drift.

### 29.11.3 Scheduler stuck (reminders not sent, exports not produced)

1. `curl -s localhost:8000/api/v1/system/health | jq .data.checks.scheduler` — read `last_tick_seconds_ago`, `queued`, `failed_24h`.
2. `> 300 s` since the last tick ⇒ the runner is not running: `$COMPOSE ps scheduler`, `$COMPOSE logs --tail 100 scheduler`.
3. Container up but no ticks ⇒ the advisory lock is held by a dead session: `$COMPOSE exec db psql -U udhaarbook -c "SELECT pid, locktype, objid FROM pg_locks WHERE locktype='advisory'"`. If a pid holds it and `pg_stat_activity` shows it idle, `SELECT pg_terminate_backend(<pid>)`.
4. Ticking but the queue is growing ⇒ raise `UB_SCHEDULER_BATCH`, or identify a slow job: `SELECT kind, count(*), max(now()-started_at) FROM platform_job WHERE status='running' GROUP BY kind`.
5. Jobs stuck in `running` past their lease ⇒ they will be reclaimed on the next tick; force it with `$COMPOSE exec scheduler python manage.py run_scheduler --once --reclaim`.
6. A poisonous job failing repeatedly: `SELECT id, kind, attempts, last_error FROM platform_job WHERE status='failed' ORDER BY finished_at DESC LIMIT 20`. Fix the cause, then `manage.py requeue_job <id>`. Never delete a failed job without recording why.
7. Restart as a last resort: `$COMPOSE restart scheduler`. In-flight jobs are reclaimed by lease; every job is idempotent, so nothing is double-applied.
8. If reminders were missed for a day, re-run the periodic task explicitly: `manage.py run_scheduler --task ledger.schedule_auto_reminders --date 2026-09-18` — the unique constraint on `(party_id, due_on, kind)` prevents duplicates.

### 29.11.4 Disk full

1. `df -h` — which filesystem, and is it the data disk or the root disk?
2. `du -sh /var/lib/docker/* /srv/udhaarbook/* 2>/dev/null | sort -h | tail -20`.
3. **Immediate, safe reclaim, in this order:**
   - `docker image prune -af --filter "until=168h"` (old images; never prune the running tags)
   - `docker builder prune -af` (build cache — usually the largest single win)
   - `truncate -s 0 $(docker inspect --format='{{.LogPath}}' $($COMPOSE ps -q))` if json-file rotation was misconfigured
   - Remove expired exports: `$COMPOSE exec backend python manage.py expire_exports --force`
4. **Never** delete from `/srv/udhaarbook/pgdata`, `/srv/udhaarbook/backups` or the media volume to free space.
5. If Postgres has already stopped on a full disk: free space first, then start it; it recovers cleanly from WAL. Do not delete WAL files manually — use `pg_archivecleanup` if archiving is on.
6. If media is the cause, move the oldest `bills/<yyyy>/<mm>/` directories to the backup volume and record it; the object-storage step (§29.10 #6) is now triggered.
7. Add a threshold check to the daily job (`ops.check_disk`, WARNING at 80 %, CRITICAL at 90 %) if one is not already firing — a disk-full incident that arrived without warning is itself a defect.

### 29.11.5 Failed migration

1. **Stop.** Do not restart containers; do not re-run `migrate` blindly. The deploy has already halted at §29.6.2 step 4, before anything was restarted.
2. Read the error. Note whether it failed *before* or *during* the schema change: `$COMPOSE exec backend python manage.py showmigrations <app> | tail -20`.
3. If it failed before applying (a syntax or import error): fix the migration, redeploy. Nothing was changed.
4. If it failed partway through a *data* migration: determine what was written. Data migrations are batched and resumable by design (§29.5.3), so re-running usually completes. Confirm the batching is idempotent before re-running.
5. If it failed partway through a *schema* migration: Postgres DDL is transactional, so an atomic migration left nothing behind. A non-atomic migration (`atomic = False`, used for `CONCURRENTLY`) may have left an **invalid index**: `SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;` — drop it and re-run.
6. If a lock timeout caused it: find the blocker (§29.11.2 step 7), clear it, re-run during a quieter window.
7. If the migration cannot be made to work: restore from the pre-deploy backup (§29.11.7) and redeploy the previous tag. This is why step 2 of the deploy takes a backup.
8. Record the cause in `ops/DEPLOY_LOG` and add a regression test (Part 28 §28.3.7) for the failure mode.

### 29.11.6 Certificate expiry

1. Check: `$COMPOSE exec nginx openssl x509 -enddate -noout -in /etc/letsencrypt/live/<host>/fullchain.pem`.
2. Renew: `$COMPOSE run --rm certbot renew --webroot -w /var/www/acme`. Read the output — a failure usually names the cause (DNS, rate limit, or a challenge path not reachable).
3. Reload nginx: `$COMPOSE exec nginx nginx -s reload`. Verify: `curl -vI https://<host> 2>&1 | grep -i 'expire\|subject'`.
4. If the HTTP-01 challenge fails, confirm nginx serves `/.well-known/acme-challenge/` on port 80 for that host and that the redirect-to-HTTPS rule excludes it.
5. If Let's Encrypt rate limits are hit (5 failures per hour per account), wait rather than retrying — retrying extends the block.
6. For a **partner** custom domain (Part 24 §24.5.2), confirm the hostname is still verified and the CNAME still points at the ingress before issuing; a partner who moved their DNS is the most common cause.
7. Already expired and users are seeing warnings: renew as above; if ACME cannot complete quickly, the fastest mitigation is to remove that server block so the host falls back to the platform apex, and tell the partner.
8. Confirm the daily `ops.check_certificates` job is running and warning; if it was silent, that is the defect to fix.

### 29.11.7 Restore from backup

**This procedure destroys the current database. Read it fully before starting. Announce the outage.**

1. Identify the dump: `ls -la /srv/udhaarbook/backups/daily/ | tail -5`. Verify its checksum: `sha256sum -c <file>.sha256`. Read `<file>.verify` for the row count recorded at backup time.
2. Announce: put nginx into maintenance mode (`$COMPOSE exec nginx ln -sf /etc/nginx/conf.d/maintenance.conf.disabled /etc/nginx/conf.d/maintenance.conf && nginx -s reload`).
3. Stop the writers: `$COMPOSE stop backend scheduler frontend backup`. Leave `db` running.
4. **Preserve the current state before destroying it** — even a corrupted database may hold transactions the dump does not: `$COMPOSE exec -T db pg_dump -U udhaarbook -Fc udhaarbook > /srv/udhaarbook/backups/pre-restore-$(date -u +%Y%m%dT%H%M%SZ).dump` (skip only if the server cannot dump).
5. Recreate the database:
   ```bash
   $COMPOSE exec -T db psql -U udhaarbook -d postgres -c \
     "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='udhaarbook'"
   $COMPOSE exec -T db dropdb   -U udhaarbook udhaarbook
   $COMPOSE exec -T db createdb -U udhaarbook udhaarbook
   ```
6. Restore: `cat <file>.dump | $COMPOSE exec -T db pg_restore -U udhaarbook -d udhaarbook --no-owner --no-privileges --jobs=2`. Expect warnings about extensions; expect **no** errors.
7. Restore media if it is also lost: `rsync -a /srv/udhaarbook/backups/media/<day>/ /var/lib/docker/volumes/udhaarbook_ub_media/_data/`.
8. Bring up the backend **only** and check the schema is current: `$COMPOSE up -d backend && $COMPOSE exec backend python manage.py migrate --check`. If migrations are pending (the dump predates the deployed code), run `migrate`.
9. **Verify the data before letting users in:**
   ```bash
   $COMPOSE exec backend python manage.py check_integrity        # recompute comparison, read-only
   $COMPOSE exec -T db psql -U udhaarbook -tAc "SELECT count(*) FROM ledger_entry"   # vs .verify
   $COMPOSE exec -T db psql -U udhaarbook -tAc "SELECT max(created_at) FROM ledger_entry"
   ```
10. Start the rest: `$COMPOSE up -d`. Run `./ops/smoke.sh`. Remove maintenance mode.
11. **Tell every affected tenant what was lost.** The gap between the dump's timestamp and the incident is data merchants entered and believe exists. Silence here is the failure that ends the relationship, not the outage.
12. Write the incident up in `ops/INCIDENTS.md` with the RPO actually achieved, and if it was worse than intended, schedule §29.5.4 (PITR).
