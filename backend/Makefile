# Part 32 §32.3.3 task S0-13. `make ci` reproduces the pipeline locally.
DJANGO ?= python manage.py
export DJANGO_SETTINGS_MODULE ?= config.settings.local

.PHONY: help install check test ci migrate migrations seed run scheduler up down fmt lint

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-14s %s\n", $$1, $$2}'

install:  ## Install the dev requirements
	pip install -r requirements/dev.txt

fmt:  ## Format (black + isort)
	black . && isort .

lint:  ## Lint (flake8, plus the formatter checks)
	black --check . && isort --check-only . && flake8 .

check:  ## Django system checks and the missing-migration gate
	$(DJANGO) check
	$(DJANGO) makemigrations --check --dry-run

test:  ## The full test suite
	DJANGO_SETTINGS_MODULE=config.settings.test pytest

ci: lint check test  ## Everything CI runs

migrations:  ## Generate migrations
	$(DJANGO) makemigrations

migrate:  ## Apply migrations (an explicit deploy step — never the entrypoint)
	$(DJANGO) migrate

seed:  ## Seed reference data (idempotent)
	$(DJANGO) seed_reference_data

run:  ## Development server
	$(DJANGO) runserver 0.0.0.0:8000

scheduler:  ## The job runner, in the foreground
	$(DJANGO) run_scheduler --interval 5

up:  ## docker compose up
	docker compose up -d --build

down:  ## docker compose down (volumes are preserved)
	docker compose down
