#!/bin/sh
set -eu
export PORT="${PORT:-8080}"
case "$PORT" in *[!0-9]*|'') echo 'PORT must be numeric' >&2; exit 1;; esac
# Railway mounts volumes as root. App processes only write to these directories.
mkdir -p /srv/media /srv/static /app/backend/logs
chown app:app /srv/media /srv/static /app/backend/logs
envsubst '${PORT}' < /app/deploy/nginx.conf.template > /tmp/nginx.conf
nginx -t -c /tmp/nginx.conf
exec /usr/bin/supervisord -c /app/deploy/supervisord.conf
