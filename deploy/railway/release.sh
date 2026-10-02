#!/bin/sh
# Configure this as Railway's pre-deploy command; a failure stops the release.
set -eu
cd /app/backend
python manage.py migrate --noinput
python manage.py seed_reference_data
python manage.py seed_plans
