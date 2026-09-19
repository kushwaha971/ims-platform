#!/bin/sh
# Part 20 §20.13.5: wait for the database, then exec. That is all it does.
#
# It does NOT run `migrate` and it does NOT run `seed_reference_data`. Both are
# explicit, ordered deploy steps owned by Part 29 (§29.5.2, §29.6.2:
# build → migrate → seed → restart backend → restart scheduler → restart frontend).
# Three reasons: two containers starting concurrently would both attempt migrate;
# a failed migration must stop the deploy with a clear error rather than produce a
# crash-looping container that masks the cause; and the old code must run against
# the new schema for the seconds between migrate and restart, which is the
# zero-downtime rule itself.
#
# A fresh container started against an unmigrated database will therefore fail its
# health check. That is the intended behaviour.
set -eu

host="${POSTGRES_HOST:-db}"
port="${POSTGRES_PORT:-5432}"
user="${POSTGRES_USER:-udhaarbook}"

echo "entrypoint: waiting for postgres at ${host}:${port}"
i=0
until pg_isready -h "${host}" -p "${port}" -U "${user}" >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "${i}" -ge 60 ]; then
        echo "entrypoint: database not ready after 60s; giving up" >&2
        exit 1
    fi
    sleep 1
done
echo "entrypoint: database ready after ${i}s"

exec "$@"
