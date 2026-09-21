# UdhaarBook — the operator surface.
#
# Part 29 §29.9.3 and Part 28 §28.11.4 make these targets the contract: the CI
# platform runs these commands and nothing else, so `make check && make test`
# locally is the same gate as a green pipeline. When a team arrives, the same
# targets split across parallel jobs and no test and no gate changes.
#
# `make help` lists everything.

SHELL          := /usr/bin/env bash
.SHELLFLAGS    := -eu -o pipefail -c
.DEFAULT_GOAL  := help

COMPOSE        ?= docker compose
COMPOSE_PROD   ?= docker compose -f docker-compose.yml -f docker-compose.prod.yml
COMPOSE_STAGE  ?= docker compose -f docker-compose.yml -f docker-compose.staging.yml
BACKEND_RUN    ?= $(COMPOSE) run --rm backend
BACKEND_EXEC   ?= $(COMPOSE) exec -T backend
DUMP           ?=
SERVICE        ?=

.PHONY: help up down logs ps migrate makemigrations seed seed-demo superadmin \
        shell dbshell test test-backend test-frontend e2e lint format check \
        check-spec ci bootstrap backup restore smoke deploy build clean nuke

# ── Operating ────────────────────────────────────────────────────────────────

up: ## Start the whole stack locally (db, backend, scheduler, frontend)
	$(COMPOSE) up -d
	@$(MAKE) --no-print-directory ps

down: ## Stop everything. Volumes — and therefore all data — are preserved
	$(COMPOSE) down

ps: ## Show service state and health
	$(COMPOSE) ps

logs: ## Tail logs. `make logs SERVICE=scheduler` for one service
	$(COMPOSE) logs -f --tail=100 $(SERVICE)

build: ## Build the images
	$(COMPOSE) build

shell: ## A Django shell inside the backend container
	$(BACKEND_RUN) python manage.py shell

dbshell: ## psql inside the db container
	$(COMPOSE) exec db psql -U $${POSTGRES_USER:-udhaarbook} -d $${POSTGRES_DB:-udhaarbook}

# ── Schema and data ──────────────────────────────────────────────────────────

migrate: ## Apply migrations. ALWAYS an explicit step — the entrypoint never migrates (§29.5.2)
	$(BACKEND_RUN) python manage.py migrate --noinput

makemigrations: ## Generate migrations for changed models
	$(BACKEND_RUN) python manage.py makemigrations

seed: ## Seed reference data (idempotent: roles, plans, partners, units, tax rates, categories, HSN)
	$(BACKEND_RUN) python manage.py seed_all

seed-demo: ## Seed one demo tenant, ~120 entries. Refuses under DEBUG=0 without --force
	$(BACKEND_RUN) python manage.py seed_demo_tenant

superadmin: ## Create a platform super admin (interactive)
	# Django's own command. `create_superadmin` was named here and in
	# bootstrap.sh and never existed. `UserManager.create_superuser` already sets
	# `is_super_admin`, and USERNAME_FIELD is `email` with
	# REQUIRED_FIELDS = ["full_name"], so the built-in prompts for the right three.
	$(BACKEND_RUN) python manage.py createsuperuser

# ── The gate ─────────────────────────────────────────────────────────────────

lint: ## Formatters and linters, both stacks, read-only
	black --check backend
	isort --check-only backend
	ruff check backend
	flake8 backend
	cd frontend && npx eslint .
	cd frontend && npx prettier --check .

format: ## Rewrite files to the house style. The only target that edits your code
	black backend
	isort backend
	ruff check --fix backend
	cd frontend && npx prettier --write .
	cd frontend && npx eslint . --fix

check: ## The full CI gate, locally: lint, types, AST checks, migrations, spec consistency
	@$(MAKE) --no-print-directory lint
	cd backend && mypy .
	cd frontend && npx tsc --noEmit
	$(BACKEND_RUN) python manage.py makemigrations --check --dry-run
	@$(MAKE) --no-print-directory check-spec

check-spec: ## Specification-consistency checks (canon §0.12.5, Part 23 §23.6)
	python3 scripts/check_table_ownership.py
	node scripts/check-contrast.mjs
	cd frontend && npm run i18n:check

test: ## Fast bands, both stacks, with coverage
	@$(MAKE) --no-print-directory test-backend
	@$(MAKE) --no-print-directory test-frontend

test-backend: ## pytest, everything except the `slow` band
	$(BACKEND_RUN) pytest -m "not slow" --cov

test-frontend: ## Jest with coverage
	cd frontend && npx jest --coverage

e2e: ## Playwright @smoke against a compose stack
	$(COMPOSE) up -d
	$(BACKEND_RUN) python manage.py seed_demo_tenant --force
	cd e2e && npx playwright test --grep @smoke

ci: check test e2e ## Everything a PR must pass
	# `build_traceability` belonged here and does not exist yet: it is
	# TSK-CHS-CI-17, still unbuilt. Calling it made `make ci` fail on a clean
	# clone for a reason that had nothing to do with the change under test.
	# Restore this line with the command, not before it.

# ── First run, backup, deploy ────────────────────────────────────────────────

bootstrap: ## Clean clone → working app (Part 29 §29.4), then §29.4.3's checklist
	./scripts/bootstrap.sh

backup: ## Run one verified backup cycle now (dump, media snapshot, restore-verify, off-host copy)
	$(COMPOSE_PROD) exec -T backup /opt/ops/backup.sh

restore: ## Restore from a dump. `make restore DUMP=/srv/.../ub-<stamp>.dump`. DESTRUCTIVE
	@test -n "$(DUMP)" || { echo "usage: make restore DUMP=/path/to/ub-<stamp>.dump" >&2; exit 2; }
	COMPOSE="$(COMPOSE_PROD)" ./scripts/restore.sh --dump "$(DUMP)" --yes-destroy-the-database

smoke: ## Post-deploy smoke test. `make smoke BASE=https://app.udhaarbook.in`
	./scripts/smoke.sh "$${BASE:-http://localhost:8000}"

deploy: ## Part 29 §29.6.2 in order: pre-flight, backup, migrate, seed, roll, smoke
	$(COMPOSE_PROD) ps
	$(COMPOSE_PROD) exec -T backup /opt/ops/backup.sh
	$(COMPOSE_PROD) build
	$(COMPOSE_PROD) run --rm backend python manage.py migrate --noinput
	$(COMPOSE_PROD) run --rm backend python manage.py seed_all
	$(COMPOSE_PROD) up -d --no-deps backend
	$(COMPOSE_PROD) up -d --no-deps scheduler
	$(COMPOSE_PROD) up -d --no-deps frontend
	./scripts/smoke.sh "$${BASE:?set BASE=https://app.udhaarbook.in}"
	@echo "$$(date -uIs) $$(git rev-parse --short HEAD) deployed by $$USER" >> ops/DEPLOY_LOG

# ── Housekeeping ─────────────────────────────────────────────────────────────

clean: ## Remove containers and build cache. Volumes survive
	$(COMPOSE) down --remove-orphans
	docker builder prune -f

nuke: ## DESTROY ALL LOCAL DATA: containers and the db, media and static volumes
	@read -p "This deletes the local database and all uploads. Type NUKE: " a; \
	 [ "$$a" = "NUKE" ] || { echo "aborted"; exit 1; }
	$(COMPOSE) down -v --remove-orphans

help: ## Show this list
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	 | sort \
	 | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
