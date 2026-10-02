# Railway builds from the repository root. PostgreSQL remains a separate service.
FROM node:22-bookworm-slim AS frontend-build
WORKDIR /build
ENV NEXT_TELEMETRY_DISABLED=1
COPY frontend/package.json frontend/package-lock.json ./
COPY frontend/vendor ./vendor
RUN npm ci
COPY frontend/ ./
ARG NEXT_PUBLIC_SITE_URL=https://yourkhata.com
ARG RAILWAY_GIT_COMMIT_SHA=dev
ENV NEXT_PUBLIC_API_BASE_URL=/api/v1 \
    NEXT_PUBLIC_ENV=production \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_COMMIT_SHA=${RAILWAY_GIT_COMMIT_SHA}
RUN npm run build

FROM python:3.12-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings.prod \
    UB_STATIC_ROOT=/srv/static UB_MEDIA_ROOT=/srv/media \
    UB_LOG_DIR=/app/backend/logs NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get -o Acquire::Retries=3 update && apt-get -o Acquire::Retries=3 install -y --no-install-recommends \
    libpq5 libjpeg62-turbo zlib1g postgresql-client nginx supervisor gettext-base curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --create-home app
COPY --from=frontend-build /usr/local/bin/node /usr/local/bin/node
WORKDIR /app/backend
COPY backend/requirements/ requirements/
RUN pip install --no-cache-dir -r requirements/prod.txt
COPY backend/ ./
COPY --from=frontend-build --chown=app:app /build/.next/standalone /app/frontend/
COPY --from=frontend-build --chown=app:app /build/.next/static /app/frontend/.next/static
COPY --from=frontend-build --chown=app:app /build/public /app/frontend/public
COPY deploy/railway/ /app/deploy/
ARG RAILWAY_GIT_COMMIT_SHA=dev
ENV UB_VERSION=${RAILWAY_GIT_COMMIT_SHA}
RUN mkdir -p /srv/static /srv/media /app/backend/logs /tmp/nginx \
    && chown -R app:app /srv /app/backend/logs /tmp/nginx \
    && chmod +x /app/deploy/*.sh
EXPOSE 8080
ENTRYPOINT ["/app/deploy/start.sh"]
