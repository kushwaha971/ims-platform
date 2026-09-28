"""`manage.py scale_probe` — time every list endpoint on a seeded book and read its plans.

    python manage.py seed_scale ...            # once
    python manage.py scale_probe --runs 20 --json /tmp/probe.json

For each endpoint of the H3 list it issues the request the client makes,
in-process through DRF with a minted owner token (server time: routing,
permissions, queries, serialisation — no network), `--runs` times after one
warm-up, and reports P50 / P95 / max milliseconds and the query count. It then
runs `EXPLAIN (ANALYZE, BUFFERS)` on every SELECT the request issued and flags
each `Seq Scan` on a tenant-scoped table larger than `--seq-threshold` rows —
the thing an index is missing for. `--plans` prints the slowest query's plan
per endpoint.

Development tool: refused with DEBUG off unless `--force`. Throttles are
bypassed for the run (the security pass owns them; this measures queries).
"""

from __future__ import annotations

import json
import statistics
import time
from typing import Any
from unittest import mock

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.test.utils import CaptureQueriesContext

#: Tables the probe treats as large and tenant-scoped (seq scans here are findings).
LARGE_TABLES = (
    "parties_party",
    "ledger_entry",
    "inventory_item",
    "inventory_item_stock",
    "inventory_stock_movement",
    "sales_document",
    "sales_document_line",
    "purchases_document",
    "purchases_document_line",
    "payments_payment",
    "payments_allocation",
    "expenses_expense",
)


def _token(membership: Any) -> str:
    from rest_framework_simplejwt.tokens import AccessToken

    token = AccessToken.for_user(membership.user)
    token["tid"] = str(membership.tenant_id)
    token["rol"] = membership.role.code
    token["ver"] = membership.permissions_version
    token["sid"] = str(membership.id)
    token["epo"] = int(membership.user.token_epoch)
    return str(token)


def endpoints(tenant: Any) -> list[tuple[str, str, dict, str]]:
    """`(label, path, params, budget)` — the requests the client makes."""
    import datetime as dt

    from django.db.models import Count

    from apps.common.dates import tenant_today
    from apps.inventory.models import Item
    from apps.ledger.models import LedgerEntry

    today = tenant_today(tenant)
    month = today.replace(day=1).isoformat()
    busiest = (
        LedgerEntry.objects.filter(tenant=tenant)
        .values("party_id")
        .annotate(n=Count("id"))
        .order_by("-n")
        .first()
    )
    party = busiest["party_id"]
    barcode = (
        Item.objects.filter(tenant=tenant, barcode__isnull=False)
        .order_by("-sku")
        .values_list("barcode", flat=True)
        .first()
    )
    fy_start = dt.date(today.year if today.month >= 4 else today.year - 1, 4, 1).isoformat()
    base = {"ordering": "-last_activity_at", "status": "active", "page_size": 25}
    b_list = "≤ 1.5 s (party list, 2,000 parties)"
    b_stmt = "≤ 1.5 s (statement, 5,000 entries)"
    b_dash = "≤ 1.2 s (dashboard P95)"
    b_list_other = "≤ 1.5 s (list first page, §12.8)"
    return [
        ("parties list", "/api/v1/parties", base, b_list),
        ("parties · search q", "/api/v1/parties", {**base, "q": "sharma"}, b_list),
        ("parties · owes me", "/api/v1/parties", {**base, "balance": "owes_me"}, b_list),
        ("parties · overdue", "/api/v1/parties", {**base, "collection": "overdue"}, b_list),
        ("parties · sort -balance", "/api/v1/parties", {**base, "ordering": "-balance"}, b_list),
        ("parties · sort name", "/api/v1/parties", {**base, "ordering": "name"}, b_list),
        ("khata timeline", f"/api/v1/parties/{party}/ledger-entries", {}, b_stmt),
        ("statement", f"/api/v1/parties/{party}/statement", {}, b_stmt),
        ("ledger summary", "/api/v1/ledger/summary", {}, b_list),
        ("ledger aging", "/api/v1/ledger/aging", {}, b_list_other),
        ("receivables aging", "/api/v1/reports/receivables-aging", {}, b_list_other),
        ("payables aging", "/api/v1/reports/payables-aging", {}, b_list_other),
        ("items list", "/api/v1/items", {"page_size": 25}, b_list_other),
        ("items · search q", "/api/v1/items", {"q": "rice", "page_size": 25}, b_list_other),
        ("items · barcode lookup", "/api/v1/items/lookup", {"barcode": barcode}, b_list_other),
        ("stock summary", "/api/v1/stock/summary", {}, b_list_other),
        ("invoices list", "/api/v1/sales/invoices", {"page_size": 25}, b_list_other),
        (
            "invoices · unpaid",
            "/api/v1/sales/invoices",
            {"status": "issued,partially_paid", "page_size": 25},
            b_list_other,
        ),
        ("payments list", "/api/v1/payments", {"page_size": 25}, b_list_other),
        ("bills list", "/api/v1/purchases/bills", {"page_size": 25}, b_list_other),
        ("expenses list", "/api/v1/expenses", {"page_size": 25}, b_list_other),
        ("day book (month)", "/api/v1/reports/day-book", {"date_from": month}, b_list_other),
        (
            "sales register (FY)",
            "/api/v1/reports/sales-register",
            {"date_from": fy_start, "date_to": today.isoformat()},
            b_list_other,
        ),
        (
            "purchase register (FY)",
            "/api/v1/reports/purchase-register",
            {"date_from": fy_start, "date_to": today.isoformat()},
            b_list_other,
        ),
        (
            "GST summary (FY)",
            "/api/v1/reports/gst-summary",
            {"date_from": fy_start, "date_to": today.isoformat()},
            b_list_other,
        ),
        ("stock report", "/api/v1/reports/stock-summary", {}, b_list_other),
        ("dashboard", "/api/v1/reports/dashboard", {}, b_dash),
        ("dashboard (refresh)", "/api/v1/reports/dashboard", {"refresh": "1"}, b_dash),
    ]


def _walk(node: dict, found: list) -> None:
    if node.get("Node Type") == "Seq Scan":
        found.append(
            (node.get("Relation Name"), node.get("Actual Rows", 0), node.get("Filter") or "")
        )
    for child in node.get("Plans", []) or []:
        _walk(child, found)


def explain(sql: str, params: Any) -> tuple[dict, str]:
    with connection.cursor() as cursor:
        cursor.execute("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + sql, params)
        plan = cursor.fetchone()[0][0]
        cursor.execute("EXPLAIN (ANALYZE, FORMAT TEXT) " + sql, params)
        text = "\n".join(row[0] for row in cursor.fetchall())
    return plan, text


def unavoidable_seq_scans(sql: str) -> set[str]:
    """Relations still read by a Seq Scan when the planner is FORBIDDEN one.

    On a one-tenant database a tenant filter matches every row, so a seq scan is
    the right plan and says nothing about indexes. `enable_seqscan = off` makes
    every other path cheaper than any seq scan: whatever still seq-scans has no
    index that can serve the predicate at all — that is the missing-index finding.
    """
    return forced_index_plan(sql)[0]


def forced_index_plan(sql: str) -> tuple[set[str], list[str]]:
    """`(no_index, weak)` from an ANALYZEd plan with seq scans forbidden.

    `weak` names an index scan that had to throw away most of what it read
    (`Rows Removed by Filter` over 5,000 and ten times what it kept): an index
    exists but leads with the tenant only, so within a big tenant it is a full
    scan by another name — the case a composite index fixes.
    """
    with connection.cursor() as cursor:
        cursor.execute("SET enable_seqscan = off")
        try:
            cursor.execute("EXPLAIN (ANALYZE, FORMAT JSON) " + sql)
            plan = cursor.fetchone()[0][0]
        finally:
            cursor.execute("RESET enable_seqscan")
    found: list = []
    _walk(plan["Plan"], found)
    weak: list[str] = []

    def visit(node: dict) -> None:
        relation = node.get("Relation Name")
        removed = node.get("Rows Removed by Filter", 0) or 0
        kept = (node.get("Actual Rows", 0) or 0) * (node.get("Actual Loops", 1) or 1)
        if relation in LARGE_TABLES and removed > 5_000 and removed > 10 * kept:
            weak.append(
                f"{relation} via {node.get('Index Name', node.get('Node Type'))}: "
                f"kept {kept}, removed {removed} by {(node.get('Filter') or '')[:160]}"
            )
        for child in node.get("Plans", []) or []:
            visit(child)

    visit(plan["Plan"])
    return {relation for relation, _a, _e in found if relation in LARGE_TABLES}, weak


def table_sizes(tenant_id: Any) -> dict[str, int]:
    """Rows per table for this tenant (line tables carry no tenant_id: via their header)."""
    headers = {
        "sales_document_line": "sales_document",
        "purchases_document_line": "purchases_document",
    }
    sizes = {}
    with connection.cursor() as cursor:
        for table in LARGE_TABLES:
            if table in headers:
                sql = (
                    f"SELECT count(*) FROM {table} l JOIN {headers[table]} d "  # noqa: S608
                    "ON d.id = l.document_id WHERE d.tenant_id = %s"
                )
            else:
                sql = f"SELECT count(*) FROM {table} WHERE tenant_id = %s"  # noqa: S608
            cursor.execute(sql, [str(tenant_id)])
            sizes[table] = cursor.fetchone()[0]
    return sizes


class Command(BaseCommand):
    help = "Time the list endpoints on a seeded tenant and flag seq scans. Dev tool."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("--tenant", default=None, help="Tenant id (default: the largest).")
        parser.add_argument("--runs", type=int, default=15)
        parser.add_argument("--only", default=None, help="Substring filter on endpoint labels.")
        parser.add_argument("--json", default=None, help="Write the results to this file.")
        parser.add_argument("--plans", action="store_true", help="Print the slowest plan.")
        parser.add_argument("--seq-threshold", type=int, default=5_000)
        parser.add_argument(
            "--dump-seq", action="store_true", help="Print selective seq-scan filters."
        )
        parser.add_argument(
            "--writes",
            type=int,
            default=0,
            help="Also time N khata posts and N invoice issues (§12.5's two write budgets).",
        )
        parser.add_argument("--force", action="store_true")

    def handle(self, *args: Any, **opts: Any) -> None:
        if not settings.DEBUG and not opts["force"]:
            raise CommandError("scale_probe is a development tool; pass --force with DEBUG=0.")
        import logging

        from django.db.models import Count
        from rest_framework.test import APIClient

        from apps.ledger.models import LedgerEntry
        from apps.platform_app.models import Membership, Tenant

        tenant_id = opts["tenant"] or (
            LedgerEntry.objects.values("tenant_id")
            .annotate(n=Count("id"))
            .order_by("-n")
            .values_list("tenant_id", flat=True)
            .first()
        )
        tenant = Tenant.objects.get(pk=tenant_id)
        logging.getLogger("ub.access").setLevel(logging.WARNING)
        member = (
            Membership.objects.select_related("user", "role")
            .filter(tenant=tenant, role__code="owner")
            .first()
        )
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {_token(member)}")
        sizes = table_sizes(tenant.id)
        self.stdout.write(json.dumps(sizes))
        results = []
        with mock.patch(
            "rest_framework.throttling.SimpleRateThrottle.allow_request", return_value=True
        ):
            for label, path, params, budget in endpoints(tenant):
                if opts["only"] and opts["only"] not in label:
                    continue
                params = {k: v for k, v in params.items() if v is not None}
                first = client.get(path, params)
                if first.status_code != 200:
                    self.stdout.write(self.style.ERROR(f"{label}: HTTP {first.status_code}"))
                    results.append({"label": label, "status": first.status_code})
                    continue
                times = []
                for _ in range(max(1, opts["runs"])):
                    started = time.perf_counter()
                    client.get(path, params)
                    times.append((time.perf_counter() - started) * 1000)
                with CaptureQueriesContext(connection) as captured:
                    client.get(path, params)
                seq, no_index, weak, slowest = [], set(), [], (0.0, "", "")
                for query in captured.captured_queries:
                    sql = query["sql"]
                    if not sql.lstrip().upper().startswith(("SELECT", "WITH")):
                        continue
                    # The captured SQL is already interpolated; run it as-is.
                    plan, text = explain(sql, None)
                    ms = plan.get("Execution Time", 0.0)
                    found: list = []
                    _walk(plan["Plan"], found)
                    for relation, actual, where in found:
                        if (
                            relation in LARGE_TABLES
                            and sizes.get(relation, 0) >= opts["seq_threshold"]
                        ):
                            seq.append(f"{relation} ({sizes[relation]} rows, {actual} returned)")
                            # A SELECTIVE predicate read by a full scan is the
                            # interesting kind: print it for --dump-seq.
                            if opts["dump_seq"] and actual * 10 < sizes[relation]:
                                self.stdout.write(
                                    f"    [{label}] seq {relation} -> {actual}: {where[:300]}"
                                )
                    if any(relation in LARGE_TABLES for relation, _a, _w in found):
                        missing, thin = forced_index_plan(sql)
                        no_index |= missing
                        weak.extend(thin)
                    if ms > slowest[0]:
                        slowest = (ms, sql[:400], text)
                times.sort()
                row = {
                    "label": label,
                    "path": path,
                    "params": params,
                    "status": 200,
                    "p50_ms": round(statistics.median(times), 1),
                    "p95_ms": round(times[max(0, int(len(times) * 0.95 + 0.5) - 1)], 1),
                    "max_ms": round(times[-1], 1),
                    "queries": len(captured.captured_queries),
                    "slowest_sql_ms": round(slowest[0], 2),
                    "seq_scans": sorted(set(seq)),
                    "no_index": sorted(no_index),
                    "weak_index": weak,
                    "budget": budget,
                }
                results.append(row)
                flag = self.style.WARNING if row["seq_scans"] else self.style.SUCCESS
                self.stdout.write(
                    flag(
                        f"{label:<26} p50 {row['p50_ms']:>7} ms  p95 {row['p95_ms']:>7} ms  "
                        f"q {row['queries']:>3}  slowest SQL {row['slowest_sql_ms']:>7} ms  "
                        f"seq: {', '.join(row['seq_scans']) or '-'}  "
                        f"NO INDEX: {', '.join(row['no_index']) or '-'}"
                    )
                )
                for line in weak:
                    self.stdout.write(self.style.WARNING(f"    weak index: {line}"))
                if opts["plans"]:
                    self.stdout.write(slowest[2])
        if opts["writes"]:
            results.extend(self._writes(client, tenant, opts["writes"]))
        if opts["json"]:
            with open(opts["json"], "w", encoding="utf-8") as handle:
                json.dump(
                    {"tenant_id": str(tenant.id), "sizes": sizes, "results": results},
                    handle,
                    indent=2,
                )

    def _writes(self, client: Any, tenant: Any, runs: int) -> list[dict]:
        """`POST /ledger-entries` (≤ 250 ms) and invoice issue (≤ 600 ms), P95."""
        import uuid

        from apps.common.dates import tenant_today
        from apps.inventory.models import ItemStock
        from apps.parties.models import Party

        today = tenant_today(tenant).isoformat()
        party = Party.objects.filter(tenant=tenant, is_customer=True, status="active").first()
        stocked = list(
            ItemStock.objects.filter(
                tenant=tenant, on_hand__gte=10, item__tax_code__in=("GST5", "GST18")
            )
            .order_by("-on_hand")
            .values_list("item_id", flat=True)[:3]
        )
        entry_ms, issue_ms = [], []
        for n in range(runs):
            started = time.perf_counter()
            response = client.post(
                "/api/v1/ledger-entries",
                {
                    "party_id": str(party.id),
                    "direction": "debit",
                    "amount": "150.00",
                    "entry_date": today,
                    "note": f"probe {n}",
                },
                format="json",
                HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
            )
            entry_ms.append((time.perf_counter() - started) * 1000)
            assert response.status_code == 201, response.content[:300]
            draft = client.post(
                "/api/v1/sales/invoices",
                {
                    "party_id": str(party.id),
                    "lines": [{"item_id": str(i), "qty": "1"} for i in stocked],
                },
                format="json",
            ).json()["data"]
            started = time.perf_counter()
            issued = client.post(
                f"/api/v1/sales/invoices/{draft['id']}/issue",
                {"version": draft["version"]},
                format="json",
                HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
            )
            issue_ms.append((time.perf_counter() - started) * 1000)
            assert issued.status_code == 200, issued.content[:300]
        rows = []
        for label, times, budget in (
            ("POST /ledger-entries", entry_ms, "≤ 250 ms P95"),
            ("invoice issue", issue_ms, "≤ 600 ms P95"),
        ):
            times.sort()
            row = {
                "label": label,
                "status": 200,
                "p50_ms": round(statistics.median(times), 1),
                "p95_ms": round(times[max(0, int(len(times) * 0.95 + 0.5) - 1)], 1),
                "max_ms": round(times[-1], 1),
                "budget": budget,
            }
            rows.append(row)
            self.stdout.write(f"{label:<26} p50 {row['p50_ms']:>7} ms  p95 {row['p95_ms']:>7} ms")
        return rows
