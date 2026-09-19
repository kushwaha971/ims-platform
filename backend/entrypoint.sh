#!/bin/sh
# Compatibility shim. The canonical entrypoint lives at `docker/entrypoint.sh`,
# which is where Part 20 §20.2.1's tree puts it and what the Dockerfile's
# ENTRYPOINT names. This path exists because the repository-root tooling
# (`scripts/wait-for-db.sh`) refers to `backend/entrypoint.sh`; keeping one
# implementation and one forwarder is safer than keeping two copies that drift.
exec "$(dirname "$0")/docker/entrypoint.sh" "$@"
