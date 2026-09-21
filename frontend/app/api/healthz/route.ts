import { NextResponse } from 'next/server';

/**
 * `GET /api/healthz` — the frontend container's liveness probe.
 *
 * `docker-compose.yml` has always pointed the `frontend` healthcheck here and
 * `scripts/bootstrap.sh` §29.4.3 has always verified it, but the route did not
 * exist. The container therefore never reported healthy, so `bootstrap.sh`
 * waited out its five-minute loop at step 9 and then failed two checks — on a
 * frontend that was serving pages correctly the whole time. Found by reading the
 * bootstrap path after `seed_all`, which was the same class of defect: the
 * operator surface naming something the code does not have.
 *
 * Deliberately shallow. It answers "is this Node process serving?" and nothing
 * else — it does not call the API, because the frontend is not unhealthy when
 * the backend is down. Compose already models that dependency with
 * `depends_on: backend: condition: service_healthy`, and a probe that failed on
 * the backend's behalf would restart a container that has nothing wrong with it.
 *
 * `force-dynamic` because a cached 200 is not a health check.
 */
export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  return NextResponse.json({ status: 'ok' }, { status: 200 });
}
