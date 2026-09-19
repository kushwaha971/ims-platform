# 03 — Performance and optimisation review

**Scope** `backend/` and `frontend/` at the Sprint-1 boundary. Read-only review; nothing was changed.
**Method** Real `next build`; gzip -9 of every emitted chunk mapped back to routes through
`.next/server/app/**/page_client-reference-manifest.js`; a second full build of a modified copy in
`/tmp/perf-variant` to isolate one dependency's cost; `EXPLAIN (ANALYZE, BUFFERS)` against local
PostgreSQL 16.13 with 140,000 seeded `parties_party` rows; `CaptureQueriesContext` against the live
DRF stack over that database.
**Snapshot** Frontend figures are from a build of the tree at 2026-09-19 13:00 UTC. A sibling
agent was editing `frontend/src` concurrently; re-measuring after their edits moved the shared
baseline by +0.5 KB gz (300.6 → 301.1), so every frontend number below is accurate to ±1 KB.

**Date** 2026-09-19

---

## Verdict

**The backend is fast and the frontend is not, and neither of the two CI gates that were supposed to
tell you that is actually running.** Every route in the application — including `/legal/terms`, which
is a page of text — ships **262 KB of gzipped JavaScript** (890 KB unzipped) before a single row of
data is fetched, against a specified budget of 230 KB for the heaviest route. That is roughly **1.3 s
of transfer plus 0.9 s of parse on the target device** before anything is interactive, and the app
then makes **two serial round trips** (`/auth/me`, then `/parties`) because the session guard blocks
its children. Time to first party row lands near **3.3 s** against a 1.2 s P75 target. The single
largest cause is that there is **no `next/dynamic` anywhere in the tree** — §19.9.3 names six things
that should be split and none of them are.

The backend, by contrast, has no N+1 and a genuinely well-built job runner: the claim query is
**1.07 ms at 200,000 queued rows**. Its two real defects are one-liners. `GET /parties` runs **7
queries against a budget of 4**, and two of those seven disappear by adding `"tenant__plan",
"tenant__partner"` to one `select_related` — that fix applies to *every* authenticated endpoint the
product will ever have. And the party list reads the whole tenant's rows where it should read a page:
**41.1 ms / 2,466 buffers at 98,000 rows**, dropping to **0.094 ms / 28 buffers** with the right
index — but only 3.5 ms at a realistic 9,800-row shop, so this is a scaling defect rather than
something a merchant feels today.

### Headline numbers

| | Measured | Specified | |
|---|---|---|---|
| Total first-load JS, `/parties` (modern browser) | **262.0 KB gz** shared + 10.9 KB route = **272.9 KB** | ≤ 230 KB (§19.9.2) | **+19 %** |
| Total first-load JS, `/legal/terms` (a text page) | **262.7 KB gz** | — | same shell as the app |
| Shared app chunk | **135.3 KB gz** | 85 KB (§19.9.2) | **+59 %** |
| Worst query count | **`GET /parties` = 7** | 4 (§20.14.1) | **+75 %** |
| Worst query at 100k rows | `GET /parties` page 1 — **41.1 ms, 2,466 buffers, 98,000 rows scanned for 25** | "never O(page_size)" | O(tenant) |
| Worst unindexed query | party search — **42.7 ms, 99,999 rows discarded**; the `gin_trgm_ops` index that exists cannot serve it | — | **610× off** |
| Job claim at 200k depth | **1.07 ms** | — | correct |
| Query-budget tests in the repo | **0** | "asserted in a test; exceeding it fails CI" | gate absent |
| Bundle-budget check in CI | **no-op** (`npm run bundle:check --if-present`, script does not exist) | "exceeding a budget fails the build" | gate absent |

---

## BLOCKING

### B1 — Both performance gates named in the specification are silently doing nothing

This is first because it explains every other number in this report.

`.github/workflows/ci.yml:279-283` is the frontend bundle gate:

```yaml
      - name: Build and check the bundle size
        working-directory: frontend
        run: |
          npm run build
          npm run bundle:check --if-present
```

`bundle:check` **does not exist** in `frontend/package.json` (confirmed: `grep -c "bundle:check"
frontend/package.json` → `0`). `--if-present` makes npm exit 0 without running anything. §19.9.2 says
"Enforced in CI by a `scripts/check-bundle.mjs` step reading `.next/build-manifest.json`; exceeding a
budget fails the build" — `frontend/scripts/` contains only `check-contrast.mjs` and
`check-locales.mjs`. The step has been green on every PR while the bundle went 19–59 % over budget.

The backend gate is the same shape. `.github/workflows/ci.yml:243` is named *"pytest (fast bands,
with coverage and query budgets)"* and line 399 lists query budgets among the things that must be
green to merge. There are **zero** query-count assertions in the repository:

```
$ grep -rn "num_queries\|CaptureQueriesContext\|assertNumQueries" --include="*.py" backend/ | wc -l
0
```

§20.14.1 supplies the test body to copy and stresses that the second half — asserting the same count
at two page sizes — is the important half. Neither half exists.

**Cost** Both budgets are unenforced, so both have already drifted: the shared app chunk is 50 KB
over and `GET /parties` is 3 queries over, and CI reported neither.
**Smallest fix** Write `frontend/scripts/check-bundle.mjs` and change line 283 to `npm run
bundle:check` (no `--if-present`); add one `django_assert_num_queries` test per list endpoint, in the
exact shape §20.14.1 gives. Until then, treat every budget in Parts 19 and 20 as documentation.

---

### B2 — 262 KB of JavaScript on every route, including routes that render only text

**Measurement.** `npm ci && npm run build` (Next 16.3.5, Turbopack), then gzip -9 of each chunk,
attributed to routes through the per-route RSC manifests. The set of chunks common to *every*
app route:

| Chunk | gz | raw | Contents |
|---|---:|---:|---|
| `27t_qfc-3_lzs.js` | 69.8 KB | 223.8 KB | react-dom |
| `0cp3p49xq-7_n.js` | 60.5 KB | 199.8 KB | design-system vendor: **@tanstack/react-table**, decimal.js-light, lucide, react-hook-form |
| `2e_lrwr-bf1eq.js` | 42.7 KB | 156.2 KB | Next App Router client runtime |
| `0lye4fxohzul6.js` | 21.8 KB | 58.5 KB | axios |
| `083gjtvh5az4t.js` | 14.4 KB | 48.9 KB | react-intl / formatjs |
| `2p3o_wyvnnzo6.js` | 12.1 KB | 38.4 KB | react-intl + redux + `locales/en.json` |
| `1ajdw6qzngr1h.js` | 11.6 KB | 30.8 KB | redux-toolkit |
| `0tyih0laiak4l.js` | 10.3 KB | 34.6 KB | react-redux |
| `2mmpezlrfmbu5.js` + 4 small | 18.8 KB | 63.2 KB | next runtime, turbopack loader |
| **Total** | **262.0 KB** | **855.7 KB** | loaded on `/`, `/login`, `/legal/terms`, `/d/[token]`, everything |

(A sixth root chunk, `0cz1d0mv5g_q7.js`, 38.6 KB gz / 110 KB raw, is the legacy polyfill bundle. It
is emitted with `noModule` — confirmed in `.next/server/app/_global-error.html` — so a modern Chrome
never downloads it. It is excluded from every figure above. Reporting it as a defect would have been
wrong.)

**Against the specified budgets (§19.9.2):**

| Bundle | Budget (gz) | Measured (gz) | Δ |
|---|---:|---:|---|
| Shared framework chunk | 95 KB | **126.7 KB** | +31.7 KB (+33 %) |
| Shared app chunk | 85 KB | **135.3 KB** | +50.3 KB (+59 %) |
| `/parties` route chunk | 45 KB | 10.9 KB | −34.1 KB ✅ |
| `/dashboard` route chunk | 55 KB | 8.2 KB | −46.8 KB ✅ |
| Any other route chunk | 60 KB | ≤ 25.7 KB | ✅ |
| **Total first load on `/parties`** | **≤ 230 KB** | **272.9 KB** | **+42.9 KB (+19 %)** |

**Per-route first load, measured (modern browser, polyfill excluded):**

| Route | Route-only gz | First load gz |
|---|---:|---:|
| `/onboarding/step/[n]` | 25.7 | **287.7** |
| `/login` | 22.7 | **284.7** |
| `/signup` | 22.6 | 284.6 |
| `/reset-password` | 22.6 | 284.6 |
| `/set-password` | 22.0 | 284.0 |
| `/forgot-password` | 21.8 | 283.8 |
| `/parties` | 10.9 | **272.9** |
| `/switch` | 9.5 | 271.5 |
| `/settings/plan` | 9.3 | 271.3 |
| `/dashboard` | 8.2 | 270.2 |
| `/design-system` | 5.6 | 267.6 |
| `/onboarding` | 1.9 | 263.9 |
| `/legal/privacy` | 0.7 | 262.7 |
| `/legal/terms` | 0.7 | 262.7 |
| `/d/[token]` | 0.0 | 262.0 |
| `/` | 0.0 | 262.0 |

Note the shape: **every route chunk is comfortably under budget and the shared baseline is 59 % over.**
Code-splitting per route is working; nothing is being split *out* of the shell.

**Evidence of the mechanism.** There is no dynamic import anywhere:

```
$ grep -rn "next/dynamic\|React.lazy\|await import(" frontend/src frontend/app
(no matches outside src/hooks/useMessages.ts, which correctly splits hi.json)
```

§19.9.3 requires `next/dynamic` for charts, print templates, the import wizard, the onboarding
wizard, the design-system gallery and heavy drawers. None of the six exists yet as a dynamic import,
and the barrel at `frontend/src/design-system/index.ts` (imported in 59 places, including
`app/(public)/layout.tsx:1` for `UbBox` alone) means one component pulls the whole design system's
dependency graph into a chunk Turbopack then shares across every route.

**Cost on the target device.** At the Lighthouse mobile profile the specification names (1.6 Mbit/s ≈
200 KB/s, 150 ms RTT): 262 KB gz ≈ **1.31 s of transfer**, and 856 KB of unzipped JavaScript at the
~1 MB/s parse-and-compile rate of the reference low-end Android ≈ **0.86 s**. That is ~2.2 s of the
2.5 s LCP budget spent before the first fetch. `/login` — the first screen a merchant ever sees —
pays 285 KB for a form with two fields.

**Smallest fix, in order of KB per line changed:**
1. `next/dynamic` on `UbDataGridTable` (see B3) — 13.8 KB gz off every route, measured.
2. Keep `app/(public)/layout.tsx` and `app/(auth)/**` off the `src/design-system` barrel — import
   `src/design-system/UbBox` directly — so the public and auth routes stop carrying the app's
   component graph. `(public)` routes should be able to reach the 60 KB "any other route" budget.
3. Write the `check-bundle.mjs` of B1 first, so the next regression is caught rather than reviewed.

---

### B3 — TanStack Table ships to every route, including the phone rendering that never executes it

The brief flagged this; here is the number.

`frontend/src/design-system/UbDataGrid/UbDataGrid.tsx:12` statically imports `UbDataGridTable`, and
`frontend/src/design-system/UbDataGrid/UbDataGridTable.tsx:11` statically imports
`@tanstack/react-table`. `useGridTier.ts` is correct and its docstring states the intent exactly —
"The table is not rendered on a phone … a CSS toggle would build the row model … on a 360 px screen"
— and the *runtime* behaviour is right: below `md` the tier is `cards` and `UbDataGridTable` never
mounts. But a static import is a build-time edge, so the module is in the graph regardless of whether
it runs.

**Measurement.** A second full build of a copy of the tree at `/tmp/perf-variant`, identical except
that `UbDataGridTable.tsx` is replaced by a stub with no `@tanstack` import:

| | shipped | variant | delta |
|---|---:|---:|---|
| shared chunk containing it | 60.5 KB gz / 199.8 KB raw | 46.6 KB gz / 147.8 KB raw | **−13.8 KB gz / −52.0 KB raw** |
| total shared baseline | 300.6 KB gz | 286.8 KB gz | **−13.8 KB gz** |

Confirmed present by content: `grep -l "getCoreRowModel\|flexRender" .next/static/chunks/*.js` →
`0cp3p49xq-7_n.js`, which is in the intersection of every route's chunk set — so a merchant loading
`/login` or `/legal/terms` downloads the table engine too.

**Cost** 13.8 KB gz ≈ **70 ms of transfer** at 200 KB/s, plus 52 KB of parse, on every cold load of
every route, for code the primary user's device never executes.
**Smallest fix** In `UbDataGrid.tsx`, replace the static import with
`const UbDataGridTable = dynamic(() => import('./UbDataGridTable').then(m => m.UbDataGridTable), { ssr: false })`,
and render it only when `tier !== 'cards'`. The tier is already a value, so the condition is one
line. This is the fix §19.9.2's standing rule ("`@tanstack/react-table` is loaded only by routes that
render `UbDataGrid`") was written to produce.

---

## MAJOR

### M4 — Every authenticated request pays 2 avoidable queries because one `select_related` is two names short

**Measurement** (`CaptureQueriesContext` over the real DRF stack, live Postgres):

```
GET /api/v1/parties?page_size=25&status=active&ordering=-last_activity_at  →  7 queries
  1. platform_user            (authentication)
  2. platform_membership      (tenancy — _resolve_membership_tenant)
  3. platform_plan            ← lazy FK
  4. platform_partner         ← lazy FK
  5. platform_tenant_setting  (entitlement overrides)
  6. parties_party            COUNT(*)
  7. parties_party            page
GET /api/v1/parties?page_size=50  →  7 queries   (constant with page size — no N+1)
GET /api/v1/auth/me            →  7 queries
```

Budget for `GET /parties` is **4** (§20.14.1). The count does not scale with page size, so there is
no N+1 — the overhead is fixed per request and will be paid by every endpoint the product adds.

**Cause.** `backend/apps/common/tenancy.py:63`:

```python
        Membership.objects.select_related("tenant", "role")
```

`ModuleEnabled` (`apps/common/permissions.py:98-105`) calls `effective_modules(tenant)`, which calls
`for_tenant(tenant)` (`apps/platform_app/services/entitlements.py:73-74`), which reads `tenant.plan`
and `tenant.partner`. Those are unfetched descriptors, so each is a query. `for_tenant` is correctly
memoised on the instance — the defect is purely that the instance arrives without its two FKs.

**Verified fix.** Patching that one line in memory and re-measuring the same request:

```
BEFORE (as shipped): 7 queries -> [user, membership, plan, partner, tenant_setting, party, party]
AFTER  (+ tenant__plan, tenant__partner): 5 queries -> [user, membership, tenant_setting, party, party]
```

**Cost** 2 queries × every authenticated request. At Sprint 1's handful of endpoints that is ~1 ms;
at the ~40 endpoints of the full product, on one Postgres and 3 gunicorn workers with no cache layer,
it is 29 % of the per-request query floor.
**Smallest fix** `apps/common/tenancy.py:63` →
`select_related("tenant", "role", "tenant__plan", "tenant__partner")`. The remaining
`platform_tenant_setting` read could be memoised on the tenant instance the same way `for_tenant`
already memoises its result, taking the floor to 4.

---

### M5 — `GET /parties` reads the whole tenant's rows to return 25, because the frontend's `status` filter is not declared on the server

This is the most interesting finding in the backend, because the index that fixes it **already
exists** and is never reachable.

`apps/parties/models.py:77-79` declares `Index(fields=["tenant", "status", "-last_activity_at"],
name="ix_party_tenant_activity")` — exactly the right index for this list. `status` is the middle
column, so it can only be used when `status` is in the WHERE clause. `apps/parties/selectors/party.py:26`
orders by `-last_activity_at` and filters on tenant only, and
`apps/parties/filters.py:20` declares `fields = ("q",)` — **there is no `status` filter**. The
frontend sends one on every request: `partyListSlice.ts:48` sets `status: 'active'` in the initial
filters and `partyService.ts:71` puts it on the query string. `DjangoFilterBackend` drops it
silently.

**Measured, `EXPLAIN (ANALYZE, BUFFERS)`, 98,000 alive rows in the tenant:**

| Query as issued | Time | Buffers | Plan |
|---|---:|---:|---|
| **As shipped** (no `status` predicate) | **41.1 ms** | **2,466** | `Parallel Index Scan` on the bare tenant FK index → **top-N heapsort over 98,000 rows** for 25 |
| **The same query with `AND status='active'`** | **0.098 ms** | 29 | `Index Scan using ix_party_tenant_activity` + incremental sort, 26 rows touched |

**419× faster, 85× fewer buffers, from adding a filter the client is already sending.**

Scaling, so the severity is honest:

| Alive rows in tenant | list page 1 | COUNT(*) | search |
|---:|---:|---:|---:|
| 9,800 | 3.5 ms | 1.8 ms | 4.1 ms |
| 98,000 | 41.1 ms | 19.3 ms | 42.7 ms |

Linear in tenant size, as you would expect from a full scan. A real shop has hundreds to a couple of
thousand parties, where this costs ~1 ms and no merchant will ever feel it. It matters because the
cost is **O(tenant rows) where the specification says "never O(page_size)"**, because an aggregator
or accountant tenant is exactly the growth case, and because the fix is three lines.

**Smallest fix** Add `status` to `PartyFilterSet` (`apps/parties/filters.py`) — one field plus one
entry in `Meta.fields`. If the default view must also be fast without an explicit filter, add
`Index(fields=["tenant", "-last_activity_at"], condition=Q(deleted_at__isnull=True))`; measured with
that index present and no status predicate: **0.094 ms / 28 buffers** (from 41.1 ms / 2,466).

---

### M6 — The `gin_trgm_ops` index on `parties_party.name` cannot serve the search that it was built for

`apps/parties/migrations/0001_initial.py:135-137` creates
`GinIndex(fields=["name"], name="ix_party_name_trgm", opclasses=["gin_trgm_ops"])`, and
`apps/common/migrations/0001_enable_extensions.py` installs `pg_trgm` specifically for it. But
`apps/parties/filters.py:16` uses `lookup_expr="icontains"`, and Django compiles `icontains` to
`UPPER(name::text) LIKE UPPER(%s)`. `UPPER(name)` is a function expression; a GIN index on the bare
column cannot match it.

**Measured**, same 98,000-row tenant, selective term (1 match):

| Spelling | Time | Buffers | Index used |
|---|---:|---:|---|
| `UPPER(name) LIKE UPPER('%73421%')` — what Django emits | **42.7 ms** | 2,414 | none; 99,999 rows discarded by filter |
| `name ILIKE '%73421%'` | **1.38 ms** | 268 | `Bitmap Index Scan on ix_party_name_trgm` |
| Django's spelling, with `GIN (UPPER(name) gin_trgm_ops)` added | **0.070 ms** | **8** | `Bitmap Index Scan` |

I checked the planner was not simply choosing not to use it: with `enable_seqscan`, `enable_indexscan`
and `enable_indexonlyscan` all off, the `UPPER(...)` form still cannot reach `ix_party_name_trgm` and
falls back to a bitmap scan of the tenant index (40.7 ms). The index is genuinely unusable as written.

**Cost** 42.7 ms and 2,414 buffers per keystroke-batch at 100k rows (4.1 ms at 10k), for a
610× improvement that is one migration line. The index also costs 11 MB per 100k rows to maintain
while serving nothing — it is the second-largest index on the table.
**Smallest fix** One of:
- add `GinIndex(Upper("name"), name="ix_party_name_upper_trgm", opclasses=["gin_trgm_ops"])` and keep
  `icontains` — **no application code changes at all**, and 6.5 MB instead of 11 MB; or
- drop the existing index and change the filter to emit `ILIKE` (`lookup_expr="contains"` on a
  case-insensitive collation, or `Q(name__icontains=…)` replaced by a `TrigramSimilarity` filter).

The first is smaller and the measurement above is of exactly it.

---

### M7 — A serial waterfall puts two full round trips between hydration and the first party row

`app/layout.tsx:79` mounts `SessionBootstrap`, whose only effect is `dispatch(fetchSession())`
(`SessionBootstrap.tsx:20-23`). `app/(app)/layout.tsx:12` wraps every app route in `RequireSession`,
which returns a skeleton — **not `children`** — until the session resolves
(`RequireSession.tsx:37`). `PartyListPageContent` is a child, so `usePartyList`'s fetch effect
(`usePartyList.ts:85-88`) cannot fire until `GET /auth/me` has returned.

The sequence on a cold load of `/parties`:

```
HTML  →  262 KB JS (1.31 s)  →  hydrate (0.86 s)  →  GET /auth/me (1 RTT)  →  GET /parties (1 RTT)  →  first row
```

**Cost** At the specified 150 ms RTT with server time, each hop is ~0.3–0.4 s; the two serial hops are
**0.6–0.8 s** that could largely be one. Estimated time to first party row ≈ **3.3 s** against
§19.9.1's P75 ≤ 1.2 s for `ub.parties.list_rendered`. The guard itself is correct and the comment
defending it ("NOT a flash of the login screen … the most visible correctness detail in the whole
auth flow") is right — the defect is that the *data* fetch is gated on the *auth* fetch when only
rendering needs to be.

**Smallest fix** Start the list fetch in parallel with the session fetch and let `RequireSession`
gate only what is painted — e.g. move `usePartyList`'s effect above the guard, or dispatch
`fetchPartyList` from the route and keep the skeleton. A 401 already has a correct answer in the
transport layer's single-flight refresh (`AxiosInstances.ts:143-158`), so a speculative fetch costs
nothing when the session turns out to be dead.

---

## MINOR

### m8 — The three-state network model reports impairment but does not reduce work; it adds work

`useDegradedNetwork.ts` is a careful implementation and the lint rule making it the only reader of
`navigator.onLine` is right. But nothing consumes `isImpaired` to do less:

```
$ grep -rn "isImpaired\|selectNetworkState" frontend/src frontend/app --include=*.ts --include=*.tsx \
    | grep -v "networkSlice\|useDegradedNetwork.ts"
(no matches)
```

`canWriteIn` (`networkSlice.ts:138-139`) is `state !== 'offline' || writeClass === 'queueable'` — in
`degraded`, every write is allowed and unchanged. No read is suppressed, no page size reduced, no
refetch backed off. Meanwhile the probe effect (`useDegradedNetwork.ts:97-116`) fires
`GET /system/health` every ~10 s (`NET_PROBE_DEGRADED_MS`) while degraded — so a 5-minute bad-signal
spell costs **~30 extra requests on the connection that is already failing**. The probe is correctly
suppressed on a hidden tab and correctly jittered, and it is the only honest way to detect recovery,
so this is a trade-off rather than a bug — but the model as built is a *reporting* device, not an
*adaptation* device, and §19.10.3's framing implies the latter.

Also: `NetworkStrip` is the only mounter passing `withProbe: true`, and it lives in `UbAppShell`, so
the probe never runs on `/login`, `/signup` or `/reset-password` — the exact screens the comment at
`AxiosInstances.ts:130-141` says were the problem. The state can enter `degraded` there and only
leaves it on a successful response.

**Smallest fix** Have the party list ask for `page_size: 10` and skip the `meta.totals` aggregate
while `isImpaired`, and mount the probe in `AppProviders` rather than in the app shell.

### m9 — `GET /parties` selects 30 columns to serialise 8

`list_parties` returns the default queryset, so the page query is `SELECT` of all 30 model
columns including `notes` (TEXT), `billing_address` and `shipping_address` (JSONB).
`PartyListSerializer.Meta.fields` (`apps/parties/serializers/party.py:22-31`) uses 8 of them.
§20.14.2 explicitly allows `only()` on hot list paths for exactly this ("`sales_document` has ~45
columns; the list serializer needs 14"). At 100 rows/page the wire and heap cost is real but small,
and `only()` carries the deferred-field footgun the same section warns about, so this is minor until
the row gets wider. Measured at a page of 100: 25.7 ms, dominated by the missing index of M5, not by
width.

### m10 — `OrderingFilter` discards the selector's tie-breakers, so offset paging can repeat or skip a row

`apps/parties/views/party.py:37` declares `ordering_fields` and `OrderingFilter` is in
`DEFAULT_FILTER_BACKENDS` (`config/settings/base.py:169`). When the client sends
`?ordering=-last_activity_at` — which it always does (`partyListDefaults.ts:7`) — DRF **replaces**
the selector's `order_by("-last_activity_at", "name", "id")` with a single key. `last_activity_at` is
nullable, so every party that has never had an entry ties, and their relative order between two
`OFFSET` queries is undefined. A merchant paging through a list of new parties can see one twice and
miss another. Minor because it needs ≥ 26 tied rows and because `ordering=name` is the worse case for
a different reason (**26.6 ms, parallel seq scan** — no supporting index, though `ordering=-balance`
is 0.108 ms on `ix_party_tenant_balance`).

**Smallest fix** Set `ordering = ("-last_activity_at", "name", "id")` as the view's default and
append `"id"` to any client ordering.

### m11 — The reaper issues one `UPDATE` per registered job type on every tick

`apps/common/jobs.py:195-206` loops `for job_type, spec in REGISTRY.items()` and runs a separate
`UPDATE … WHERE status='running' AND job_type=… AND locked_at < cutoff`, and
`run_scheduler.py:87` calls it at the top of every loop iteration — including the tight iterations
when the queue is non-empty and the loop does not sleep.

**Measured** at 200 running jobs: **0.176 ms per job type**, using `ix_job_stuck` (partial on
`status='running'`) and filtering `job_type` in the heap. Today there are 5 registered types → 0.9 ms
per tick. The specification's `SCHEDULES` list names 20 job types and the finished product will have
more; at 40 types and 1,000 concurrently running jobs this becomes ~40 scans of the running set per
tick. Still bounded and still small — I am reporting it because it is O(types × running) where one
statement would be O(running), not because it hurts today.

**Smallest fix** One `UPDATE` with a `CASE` or a `VALUES` join over `(job_type, timeout_seconds)`,
or simply the shortest timeout for all types.

### m12 — OTP and email delivery block the HTTP response on a provider call

`apps/platform_app/services/otp.py:149` calls `send_sms(...)`, which reaches
`messaging.py:146` `backend.send(...)` — a synchronous provider call in the request path. Likewise
`auth.py:217` `messaging.send_email(...)`.

**Both are correctly outside their transactions** (`otp.py:138-147` closes the `atomic()` block
before the send; `auth.py:197-210` likewise). The thing the brief called a production incident
waiting to happen — a lock held across a provider HTTP call — **does not exist in this codebase**,
and `passwords.py:450`, `sessions.py:123`, `auth.py:260`, `memberships.py:217`, `otp.py:193` and
`entitlements.py:154` all use `select_for_update(of=("self",))` with narrow, computation-free bodies.
`ATOMIC_REQUESTS = False` (`base.py:118`) with services owning the boundary is the right posture and
is implemented.

What remains is latency: a real Indian SMS gateway answers in 200–800 ms, and the merchant waits for
it on top of their own 3G round trip. The honest counter-argument is that the alternative —
`enqueue()` — would delay the OTP by up to `UB_SCHEDULER_INTERVAL` (**60 s**, `base.py:233`), which
is far worse for an OTP. Reported as minor and informational: the current choice is defensible, but
it should be a stated decision rather than an accident, and the `ledger.send_reminder` class of
message must go through the queue.

### m13 — Five indexes on `parties_party` have never been scanned

From `pg_stat_user_indexes` after the full measurement run: `ix_party_tenant_activity` (9.1 MB),
`ix_party_tenant_balance` (8.6 MB), `ix_party_tenant_collection` (0.9 MB), `ix_party_tenant_supplier`
(0.9 MB) and `parties_party_deleted_at_55b6ef2c` (0.9 MB) all show `idx_scan = 0`; the 11 MB
`ix_party_name_trgm` shows 2 (both from my forced tests, not from the application). Four of the five
are for `PTY-02` filters that land in Sprint 3, which is fine and I would not remove them.
`ix_party_tenant_activity` is the one that was built for a query that is shipping today and cannot
use it — that is M5, and fixing M5 turns this index from 9 MB of write amplification into the index
the list runs on.

---

## What is right, and worth not breaking

- **The job runner.** `CLAIM_SQL` (`apps/common/jobs.py:139-160`) is served by
  `ix_job_claim btree (priority, run_after, created_at) WHERE status='queued'` — a partial index that
  matches the predicate and the whole `ORDER BY`. Measured at **200,000 queued rows: 1.07 ms**,
  53 buffers for the scan, `FOR UPDATE SKIP LOCKED`, claim-and-mark in one round trip. It does not
  degrade with queue depth. The `clock_timestamp()` deviation from §20.8.5 documented in
  `NOTES-FOR-REVIEW.md` §2.3 is correct. The drain-rate constraint is real and is a *design*
  constraint, not a defect: one `scheduler` replica (`docker-compose.prod.yml:51`), jobs executed
  serially, so throughput ≈ 1/(job duration) — at a 200 ms provider call that is 5 jobs/s. The
  `--job-types` partitioning flag is the escape hatch and nothing yet sizes it.
- **No N+1 anywhere.** Query count is constant across `page_size=25` and `page_size=50`, and
  `select_related` is used correctly in all 17 places it appears — `memberships.py:43` even reaches
  `tenant__plan` and `tenant__partner`, which is what makes M4's omission at `tenancy.py:63` look
  like a slip rather than a pattern.
- **Render cost on the frontend is genuinely well done** and I found nothing to report. Cells are
  `memo`ised and receive only primitives (`PartyListRow.tsx`); the column array is a module-level
  factory memoised on real dependencies (`PartyListColumns.tsx:59`); "now" is an external store so a
  clock read never invalidates that memo (`useNowMs.ts`); `useTranslation` memoises on `intl`; every
  slice selector is an identity read, so no subscription re-renders on unrelated state; search is
  debounced at 300 ms and the in-flight request is aborted when the filter set changes
  (`usePartyList.ts:76-88`). §19.9.4's "no virtualisation at MVP" is the right call at a 100-row cap.
- **Assets.** No web fonts at all (system stack via `--font-ui`), 60 KB in `public/` and all of it
  PWA icons, one 8.97 KB gz stylesheet, icons as 44 named `lucide-react` imports that tree-shake
  correctly (verified: `Gitlab`, `Volleyball`, `Rocket`, `Banana` are absent from every chunk).
  `hi.json` is correctly split into its own 8.5 KB gz chunk and only `en.json` (7.0 KB gz) is in the
  shell. Nothing blocks first paint. This part of §19.9.5 is fully delivered.
- **Cursor pagination exists and is keyset, not offset** (`apps/common/pagination.py:41-86`), with no
  `COUNT(*)`, ready for the ledger timeline. `PagePagination` does run `COUNT(*)`, but §20.14.1
  budgets for it on `/parties` and cursor is specified for the unbounded lists. Measured at 98,000
  rows the count is 19.3 ms and irreducibly O(n) — a partial `(tenant_id) WHERE deleted_at IS NULL`
  index takes it to 12.1 ms and 88 buffers (from 2,404), but the real answer for a list that grows
  without bound is the cursor paginator that is already written.

---

## What I could not measure, and why

- **Lighthouse, LCP, INP, CLS.** No headless Chrome in this environment. The 3G figures in B2 and M7
  are arithmetic from the measured byte counts against the throttling profile §19.9.1 names
  (1.6 Mbit/s, 150 ms RTT) and a ~1 MB/s parse rate for the reference low-end Android. They are
  estimates and are labelled as such; the byte counts and query counts they are built on are
  measured.
- **Most of the endpoints in §20.14.1's budget table.** `sales`, `purchases`, `ledger`, `payments`,
  `inventory`, `reports`, `expenses`, `files`, `imports`, `tax` and `help` are directory skeletons —
  empty `models.py`, empty `selectors/`, no migrations. Only `parties` and `platform_app` have
  shipping endpoints. `POST /ledger-entries` (budget 8), `POST /sales/invoices?issue=true`
  (budget ≤ 22) and `GET /reports/dashboard` (budget ≤ 8) do not exist to be measured, and the L0–L6
  lock ordering the canon fixes has nothing yet that takes more than one lock — `sessions.py:119-124`
  is the only place that even reasons about it, and its `of=("self",)` comment is correct.
- **Real-world tenant size distribution.** I seeded 9,800 and 98,000 alive parties in one tenant to
  bracket the scaling. A real shop is 50–2,000, which is why M5 and M6 are ranked major rather than
  blocking despite their ratios. If the aggregator/accountant tenant is expected to hold 100k parties,
  re-rank both to blocking.
- **Production chunking.** Measured under Turbopack (Next 16.3.5), which is what `npm run build`
  produces here. Webpack would split differently; the *dependency graph* findings (B3, the barrel)
  hold either way, the exact KB per chunk would not.
- **Server CPU and connection behaviour under load.** No load generator. `CONN_MAX_AGE=60` with
  `CONN_HEALTH_CHECKS=True` and 3 gunicorn sync workers is the shipped shape; whether 3 workers and
  ~5 queries of fixed per-request overhead is the right ratio for one Postgres is a load test, not a
  read.
