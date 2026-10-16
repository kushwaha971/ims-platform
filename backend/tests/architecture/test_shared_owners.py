"""WP-03 REUSE-02 / REUSE-04 — money rules that have ONE writer keep it.

The readiness reuse audit (docs/shop-ims-readiness/10-reuse-inventory.md) found
LED-03's corrections moving a party's udhaar balance with their own copy of
`apply_entry`'s cache arithmetic: the balance, its receivable/payable split,
`last_activity_at` and the settled-clears-the-collection-date rule. Both copies
were right on the day they were written; the next rule added to one would not
have reached the other, and a correction would then leave the khata list, the
reports' receivable total or the collection round disagreeing with the balance.

`move_main_balance` in `apps/parties/services/balance.py` owns it now. This scan
fails if the split is written anywhere else. `recalc_balances` is the one
deliberate exception: it is the independent replay the incremental cache is
checked against, and an oracle that called the code it checks would prove nothing.
"""

from __future__ import annotations

import pathlib
import re

APPS = pathlib.Path(__file__).resolve().parents[2] / "apps"
OWNER = APPS / "parties" / "services" / "balance.py"
ORACLE = APPS / "ledger" / "management" / "commands" / "recalc_balances.py"
SPLIT = re.compile(r"\.(receivable_total|payable_total)\s*=\s*max\(")


def test_only_the_owner_writes_the_receivable_payable_split() -> None:
    offenders = [
        str(path.relative_to(APPS))
        for path in APPS.rglob("*.py")
        if "tests" not in path.parts
        and "migrations" not in path.parts
        and path not in (OWNER, ORACLE)
        and SPLIT.search(path.read_text())
    ]
    assert offenders == []
