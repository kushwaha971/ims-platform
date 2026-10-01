"""T-PLT-X01-6 — today's tenants read exactly what they read before the ledger had buckets.

A2 (ADR-043) adds `ledger_entry.bucket` and teaches every reader of the balance which buckets
count. For a tenant whose every row is `main` — every tenant that exists — none of that may
change a single figure: aging, the statement, the timeline, the khata header, the ledger
summary and the dashboard must answer with the same JSON as before the migration.

The golden file was captured on the code BEFORE A2 (commit 4b964a8) by running this test with
`UB_UPDATE_GOLDEN=1`. It is never regenerated to make a failure go away: a diff here means a
merchant's screen changed. The one permitted kind of difference is a new KEY that a later task
adds on purpose (a row's `bucket`), which the comparison strips by name in
`ADDED_SINCE_CAPTURE` so that everything else is still compared byte for byte.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import pathlib
import re
import uuid
from decimal import Decimal
from typing import Any

import pytest

from apps.common.constants import Direction
from apps.ledger.constants import EntryStatus, EntryType, SourceType
from apps.ledger.models import LedgerEntry
from apps.ledger.selectors.entry import computed_balance
from apps.parties.models import Party
from tests.factories.parties import PartyFactory
from tests.factories.platform import TenantFactory

pytestmark = pytest.mark.django_db

GOLDEN = pathlib.Path(__file__).resolve().parent / "golden" / "main_bucket_reads.json"
TODAY = dt.date(2026, 9, 1)
#: The day `golden/main_bucket_reads.json` was captured; reads that default to the tenant's
#: today (the ledger summary's `as_of`) are pinned to it.
CAPTURED_ON = dt.date(2026, 9, 30)

#: Keys that did not exist when the golden file was captured and are added on purpose, each by
#: a named task. Stripped from the live response before comparing — and ONLY these:
#: `bucket` (A2, every ledger row) and `sections` (A10, `GET /reports/dashboard`'s registered
#: module sections, `[]` for a tenant with no module that registers one).
ADDED_SINCE_CAPTURE: frozenset[str] = frozenset({"bucket", "sections"})

_UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
#: Values that differ run to run for reasons that have nothing to do with the ledger.
_VOLATILE_KEYS = frozenset({"request_id", "next", "previous", "cursor", "next_cursor"})


def _row(party: Party, day: dt.date, direction: str, amount: str, **extra: Any) -> LedgerEntry:
    fields: dict[str, Any] = {
        "entry_type": (
            EntryType.MANUAL_GAVE if direction == Direction.DEBIT else EntryType.MANUAL_GOT
        ),
        "source_type": SourceType.MANUAL,
        "status": EntryStatus.POSTED,
        **extra,
    }
    return LedgerEntry.objects.create(
        tenant=party.tenant,
        party=party,
        direction=direction,
        amount=Decimal(amount),
        entry_date=day,
        **fields,
    )


def _settle(party: Party) -> None:
    """The caches as `apply_entry` would have left them."""
    balance = computed_balance(tenant=party.tenant, party_id=party.id)
    Party.all_objects.filter(pk=party.pk).update(
        balance=balance,
        receivable_total=max(balance, Decimal("0.00")),
        payable_total=max(-balance, Decimal("0.00")),
    )


def _book(tenant: Any) -> dict[str, Party]:
    """Three parties, every kind of `main` row the product writes today."""
    d = dt.date
    customer = PartyFactory(
        tenant=tenant, name="Ramesh Traders", mobile="+919700011111", credit_limit="5000.00"
    )
    _row(customer, d(2026, 4, 1), Direction.DEBIT, "2300.00", entry_type=EntryType.OPENING)
    _row(customer, d(2026, 4, 18), Direction.DEBIT, "500.00", note="Cement bags")
    _row(customer, d(2026, 4, 18), Direction.CREDIT, "300.00", payment_mode="cash")
    typo = _row(customer, d(2026, 5, 2), Direction.DEBIT, "700.00", note="Typo")
    undo = _row(
        customer,
        d(2026, 5, 2),
        Direction.CREDIT,
        "700.00",
        entry_type=EntryType.REVERSAL,
        source_type=SourceType.LEDGER_ENTRY,
        source_id=typo.id,
        reverses=typo,
        reason="Entered twice",
    )
    LedgerEntry.objects.filter(pk=typo.pk).update(status=EntryStatus.REVERSED, reversed_by=undo)
    wrong = _row(customer, d(2026, 5, 10), Direction.DEBIT, "400.00", note="Paint")
    fix = _row(
        customer,
        d(2026, 5, 10),
        Direction.CREDIT,
        "400.00",
        entry_type=EntryType.REVERSAL,
        source_type=SourceType.LEDGER_ENTRY,
        source_id=wrong.id,
        reverses=wrong,
        reason="Wrong amount",
    )
    LedgerEntry.objects.filter(pk=wrong.pk).update(status=EntryStatus.REVERSED, reversed_by=fix)
    _row(customer, d(2026, 5, 10), Direction.DEBIT, "450.00", note="Paint", supersedes=wrong)
    _row(
        customer,
        d(2026, 6, 1),
        Direction.DEBIT,
        "1180.00",
        entry_type=EntryType.INVOICE,
        source_type=SourceType.SALES_DOCUMENT,
        source_id=uuid.UUID("00000000-0000-7000-8000-000000000001"),
    )
    _row(
        customer,
        d(2026, 6, 15),
        Direction.CREDIT,
        "1000.00",
        entry_type=EntryType.PAYMENT_IN,
        source_type=SourceType.PAYMENT,
        source_id=uuid.UUID("00000000-0000-7000-8000-000000000002"),
        payment_mode="upi",
    )
    _row(
        customer,
        d(2026, 7, 1),
        Direction.CREDIT,
        "100.00",
        entry_type=EntryType.WRITE_OFF,
        note="Rounding",
        reason="Rounding",
    )

    supplier = PartyFactory(
        tenant=tenant,
        name="Gupta Wholesale",
        mobile="+919700022222",
        is_customer=False,
        is_supplier=True,
    )
    _row(
        supplier,
        d(2026, 3, 10),
        Direction.CREDIT,
        "5000.00",
        entry_type=EntryType.PURCHASE_BILL,
        source_type=SourceType.PURCHASE_DOCUMENT,
        source_id=uuid.UUID("00000000-0000-7000-8000-000000000003"),
    )
    _row(
        supplier,
        d(2026, 4, 10),
        Direction.DEBIT,
        "2000.00",
        entry_type=EntryType.PAYMENT_OUT,
        source_type=SourceType.PAYMENT,
        source_id=uuid.UUID("00000000-0000-7000-8000-000000000004"),
    )

    advance = PartyFactory(tenant=tenant, name="Sunita Advance", mobile="+919700033333")
    _row(advance, d(2026, 8, 1), Direction.CREDIT, "800.00", payment_mode="cash")

    for party in (customer, supplier, advance):
        _settle(party)
    return {"customer": customer, "supplier": supplier, "advance": advance}


def _normalise(value: Any, ids: dict[str, str], *, strip: frozenset[str]) -> Any:
    """Stable across runs: UUIDs become tokens by first appearance; timestamps and cursors go."""
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for key in sorted(value):
            if key in strip or key == "at" or key.endswith("_at"):
                continue
            item = value[key]
            if key in _VOLATILE_KEYS:
                out[key] = None if item is None else "<volatile>"
                continue
            out[key] = _normalise(item, ids, strip=strip)
        return out
    if isinstance(value, list):
        return [_normalise(item, ids, strip=strip) for item in value]
    if isinstance(value, str):
        return _UUID.sub(lambda m: ids.setdefault(m.group(0), f"<id-{len(ids) + 1}>"), value)
    return value


def _reads(client: Any, parties: dict[str, Party]) -> dict[str, Any]:
    customer = parties["customer"].id
    paths = {
        "aging_receivable": "/api/v1/ledger/aging?as_of=2026-09-01",
        "aging_payable": "/api/v1/ledger/aging?as_of=2026-09-01&type=payable",
        "report_receivables_aging": "/api/v1/reports/receivables-aging?as_of=2026-09-01",
        "report_payables_aging": "/api/v1/reports/payables-aging?as_of=2026-09-01",
        "statement": f"/api/v1/parties/{customer}/statement",
        "statement_period": (
            f"/api/v1/parties/{customer}/statement?date_from=2026-05-01&date_to=2026-06-30"
        ),
        "statement_corrections": f"/api/v1/parties/{customer}/statement?include_corrections=true",
        "timeline": f"/api/v1/parties/{customer}/ledger-entries",
        "timeline_reversed": f"/api/v1/parties/{customer}/ledger-entries?include_reversed=true",
        "party_detail": f"/api/v1/parties/{customer}",
        "supplier_detail": f"/api/v1/parties/{parties['supplier'].id}",
        "advance_detail": f"/api/v1/parties/{parties['advance'].id}",
        "ledger_summary": "/api/v1/ledger/summary",
        "dashboard": "/api/v1/reports/dashboard",
    }
    out: dict[str, Any] = {}
    for name, path in paths.items():
        response = client.get(path)
        assert response.status_code == 200, (name, response.status_code, response.content[:300])
        out[name] = response.json()
    return out


def test_a_main_only_tenant_reads_exactly_what_it_read_before_buckets(
    api_as: Any, partner: Any, plan: Any, monkeypatch: Any
) -> None:
    """The defect this prevents: a bucket filter added to one reader of the balance and not
    another (the statement but not the header, say) — invisible on every unit test of either,
    and a merchant's statement closing on a figure the khata page does not show."""
    from apps.reports.views import dashboard as dashboard_view

    monkeypatch.setattr(dashboard_view, "tenant_today", lambda tenant: TODAY)
    # The ledger summary and the aging views import `tenant_today` at call time, so the golden
    # file holds the day it was captured on in `ledger_summary.data.as_of`. Unpinned, this test
    # passed only on 30 Sep 2026 and failed on every later day — a red that says nothing about
    # buckets. Pinned to the capture day, the file stays byte-for-byte what it was.
    monkeypatch.setattr("apps.common.dates.tenant_today", lambda tenant: CAPTURED_ON)
    tenant = TenantFactory(partner=partner, plan=plan, name="Golden Stores", phone="+919900000001")
    parties = _book(tenant)
    client, _member = api_as(tenant)

    ids: dict[str, str] = {}
    if os.environ.get("UB_UPDATE_GOLDEN") == "1":
        live = _normalise(_reads(client, parties), ids, strip=frozenset())
        GOLDEN.parent.mkdir(exist_ok=True)
        GOLDEN.write_text(json.dumps(live, indent=1, sort_keys=True) + "\n", encoding="utf-8")
        pytest.skip("golden file written")

    live = _normalise(_reads(client, parties), ids, strip=ADDED_SINCE_CAPTURE)
    golden = json.loads(GOLDEN.read_text(encoding="utf-8"))
    for name in golden:
        assert live[name] == golden[name], name
    assert set(live) == set(golden)
