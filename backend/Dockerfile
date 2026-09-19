# Part 20 §20.13.5. The scheduler service runs this same image with a different
# command — that is what makes "swap the runner for Celery later" truthful.
# The final stage is named `runtime` because the repository-root
# docker-compose.yml builds this context with `target: ${BACKEND_TARGET:-runtime}`.
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings.prod

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 libjpeg62-turbo zlib1g curl postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY requirements/ requirements/
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
