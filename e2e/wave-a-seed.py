"""Wave A gate QA seed — the records only a module can write today, written through the same
public services a module will call (never raw cache updates).

Run by `e2e/wave-a-qa.mjs`, against an API started with the look-only stand-ins in
`e2e/qa_standins/` (see that file's docstring):

    QA_OWNER=<email> PYTHONPATH=e2e DJANGO_SETTINGS_MODULE=qa_settings \
        python backend/manage.py shell -c "exec(open('e2e/wave-a-seed.py').read())"

Prints one JSON line: the ids the sweep opens.
"""

import datetime as dt
import json
import os
import uuid
from decimal import Decimal

from django.db import transaction

from apps.common.constants import Direction, LedgerBucket
from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.seams import documents as port
from apps.ledger.models import LedgerEntry
from apps.parties.models import Party
from apps.parties.services.balance import apply_entry, lock_party
from apps.payments.services import deposits
from apps.platform_app.models.membership import Membership

owner = Membership.objects.select_related("tenant").get(
    user__email=os.environ["QA_OWNER"], role__code="owner"
)
tenant = owner.tenant
ctx = Ctx.system(tenant)
today = tenant_today(tenant)
out: dict = {}


def party(name: str, **extra) -> Party:
    return Party.objects.get(tenant=tenant, name=name, **extra)


def membership_line(price: str, description: str) -> dict:
    return {
        "description": description,
        "hsn_sac": "999723",
        "qty": Decimal("1"),
        "unit_price": Decimal(price),
        "tax_inclusive": False,
        "tax_code": "GST18",
    }


asha = party("Asha Rao")
with transaction.atomic():
    # A module's invoice (the origin badge, the void that asks first).
    issued = port.issue_document(
        ctx=ctx,
        request={
            "origin_type": "dues_charge",
            "origin_id": uuid.uuid4(),
            "party_id": asha.id,
            "document_date": today,
            "lines": [membership_line("2500.00", "Quarterly membership, 1 Oct – 31 Dec 2026")],
            "credit_check": "skip",
        },
    )
    out["originInvoice"] = str(issued["document_id"])

    # A value credit note (credit a line's value, not a quantity) against a second one.
    second = port.issue_document(
        ctx=ctx,
        request={
            "origin_type": "dues_charge",
            "origin_id": uuid.uuid4(),
            "party_id": asha.id,
            "document_date": today,
            "lines": [membership_line("1200.00", "Locker, October 2026")],
            "credit_check": "skip",
        },
    )
    from apps.sales.models import SalesDocumentLine

    line = SalesDocumentLine.objects.filter(document_id=second["document_id"]).first()
    note = port.issue_credit_note(
        ctx=ctx,
        against_id=second["document_id"],
        origin_type="dues_charge",
        origin_id=uuid.uuid4(),
        lines=[{"against_line_id": line.id, "taxable_value": Decimal("400.00")}],
        settlement="hold_advance",
        reason="Locker closed for ten days",
    )
    out["valueCreditNote"] = str(note["document_id"])
    out["creditedInvoice"] = str(second["document_id"])

    # A held deposit: expected 500, received 500 cash, 120 adjusted against a charge.
    deposit = deposits.open_deposit(
        ctx=ctx,
        party_id=asha.id,
        module="library",
        subject_type="library_membership",
        subject_id=uuid.uuid4(),
        purpose="Library deposit",
        expected_amount="500.00",
    )
    received = deposits.receive_deposit(
        ctx=ctx,
        deposit_id=deposit.id,
        amount="500.00",
        mode_breakup=[{"mode": "cash", "amount": "500.00"}],
    )
    fine = port.issue_document(
        ctx=ctx,
        request={
            "origin_type": "dues_charge",
            "origin_id": uuid.uuid4(),
            "party_id": asha.id,
            "document_date": today,
            "lines": [
                {
                    "description": "Late return fine",
                    "qty": Decimal("1"),
                    "unit_price": Decimal("120.00"),
                    "tax_inclusive": True,
                    "tax_code": "GST0",
                }
            ],
            "credit_check": "skip",
        },
    )
    applied = deposits.apply_deposit(
        ctx=ctx,
        deposit_id=deposit.id,
        allocations=[
            {
                "document_type": "sales_document",
                "document_id": str(fine["document_id"]),
                "amount": "120.00",
            }
        ],
        reason="Fine for a late return",
    )
    out["deposit"] = str(deposit.id)
    out["depositReceipt"] = str(received["payment"].id)
    out["adjustmentOut"] = str(applied["refund_payment"].id)

    # A loan in the party's one balance (ADR-043), written the way lending's posting will be:
    # the row and the cache move in one atom with the party locked. The write-off must offer
    # only the trade figure.
    vikram = party("Vikram Loans")
    locked = lock_party(tenant=tenant, party_id=vikram.id)
    LedgerEntry.objects.create(
        tenant=tenant,
        party=locked,
        direction=Direction.DEBIT,
        amount=Decimal("2000.00"),
        entry_date=today - dt.timedelta(days=20),
        entry_type="charge",
        source_type="lending_loan",
        source_id=uuid.uuid4(),
        bucket=LedgerBucket.LOAN,
        note="Loan disbursed",
    )
    apply_entry(
        party=locked, direction=Direction.DEBIT, amount=Decimal("2000.00"), bucket=LedgerBucket.LOAN
    )
    out["loanParty"] = str(vikram.id)

out["asha"] = str(asha.id)
print("SEED " + json.dumps(out))
