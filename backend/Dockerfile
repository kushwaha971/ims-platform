# Part 20 §20.13.5. The scheduler service runs this same image with a different
# command — that is what makes "swap the runner for Celery later" truthful.
# The final stage is named `runtime` because the repository-root
# docker-compose.yml builds this context with `target: ${BACKEND_TARGET:-runtime}`.
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 libjpeg62-turbo zlib1g curl postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY requirements/ requirements/

# ── dev ──────────────────────────────────────────────────────────────────────
# `docker-compose.override.yml` has always built backend and scheduler with
# `target: dev`, and this stage did not exist — so `docker compose up` locally
# failed at build with "target stage dev could not be found". Only the frontend
# image had one. Same family as the commands the Makefile named and the code did
# not have; found by building the path rather than validating it.
#
# Differs from runtime in three ways, all of them because the source is
# bind-mounted over /app and reloaded in place: dev requirements rather than
# prod, local settings rather than prod, and no `USER app` — uid 10001 cannot
# write to a tree owned by the host user, which is what breaks first.
FROM base AS dev

ENV DJANGO_SETTINGS_MODULE=config.settings.local

RUN pip install --no-cache-dir -r requirements/dev.txt

COPY . .

RUN mkdir -p /srv/media /srv/static /app/logs

EXPOSE 8000
ENTRYPOINT ["docker/entrypoint.sh"]
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

# ── runtime ──────────────────────────────────────────────────────────────────
FROM base AS runtime

ENV DJANGO_SETTINGS_MODULE=config.settings.prod

RUN pip install --no-cache-dir -r requirements/prod.txt

COPY . .

ARG UB_VERSION=dev
ENV UB_VERSION=${UB_VERSION}

RUN mkdir -p /srv/media /srv/static /app/logs \
    && useradd --uid 10001 --no-create-home app \
    && chown -R app /srv/media /srv/static /app/logs

USER app
EXPOSE 8000

ENTRYPOINT ["docker/entrypoint.sh"]
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "60"]
