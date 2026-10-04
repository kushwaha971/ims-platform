"""Loan-rule resolution (LIB-05 BR-1, BR-2; task B06). Pure: no queries, no writes.

For a membership type T and a material type M each column is resolved on its
own: the row (T, M) if it sets it, then the row (null, M), then T's default
(BR-1). A WHOLE-row "most specific wins" is the defect this exists to avoid: a
type-specific row that only shortens `loan_days` must not reset the fine to
the type's because it happened to be the most specific row.

A copy marked `is_reference` resolves as material `reference` whatever its
title says. A resolved `loanable = false` is lent anyway when the type
`allows_reference_loan` and M is `reference` (BR-2, D29).

B08 (due dates), B09 (issue, renew) and B10 (fines) call `resolve_rule`.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Iterable

REFERENCE = "reference"
#: The columns a rule row may override, in the order the API lists them.
RULE_COLUMNS = ("loan_days", "max_renewals", "fine_per_day", "fine_cap", "grace_days")


@dataclass(frozen=True)
class ResolvedRule:
    loanable: bool
    loan_days: int
    max_renewals: int
    fine_per_day: Decimal
    fine_cap: Decimal | None
    grace_days: int
    #: Where `loan_days` came from: `type`, `material` or `type_material` (LIB-05 §6 preview).
    source: str

    def as_json(self) -> dict:
        return {
            "loanable": self.loanable,
            "loan_days": self.loan_days,
            "max_renewals": self.max_renewals,
            "fine_per_day": f"{self.fine_per_day:.2f}",
            "fine_cap": None if self.fine_cap is None else f"{self.fine_cap:.2f}",
            "grace_days": self.grace_days,
            "source": self.source,
        }


def resolve_rule(
    membership_type: Any,
    rules: Iterable[Any],
    material_type: str,
    *,
    is_reference: bool = False,
) -> ResolvedRule:
    """The rule the counter will apply to `membership_type` borrowing `material_type`.

    `rules` is the tenant's rule rows (any order); only those for this type or for every
    type, and for the resolved material, are read.
    """
    material = REFERENCE if is_reference else material_type
    specific = general = None
    for row in rules:
        if row.material_type != material:
            continue
        if row.membership_type_id is None:
            general = row
        elif row.membership_type_id == membership_type.id:
            specific = row

    def pick(column: str) -> tuple[Any, str]:
        for row, source in ((specific, "type_material"), (general, "material")):
            if row is not None and getattr(row, column) is not None:
                return getattr(row, column), source
        return getattr(membership_type, column), "type"

    values = {column: pick(column)[0] for column in RULE_COLUMNS}
    row = specific or general
    loanable = True if row is None else bool(row.loanable)
    if not loanable and material == REFERENCE and membership_type.allows_reference_loan:
        loanable = True
    return ResolvedRule(
        loanable=loanable,
        loan_days=int(values["loan_days"]),
        max_renewals=int(values["max_renewals"]),
        fine_per_day=Decimal(values["fine_per_day"]),
        fine_cap=None if values["fine_cap"] is None else Decimal(values["fine_cap"]),
        grace_days=int(values["grace_days"]),
        source=pick("loan_days")[1],
    )
