#!/bin/sh
set -eu
cd /app/backend
python manage.py collectstatic --noinput
exec gunicorn config.wsgi:application --bind 127.0.0.1:8000 --workers "${WEB_CONCURRENCY:-2}" --timeout 60
