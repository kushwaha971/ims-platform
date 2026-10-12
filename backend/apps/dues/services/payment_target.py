"""The dues engine's two allocation targets (FRD 00 DUE-03 §6, contracts §1.4, ADR-047).

| | `dues_due` | `dues_instalment` |
|---|---|---|
| dues of | a charge-mode schedule posted to the ledger | an expectation schedule (lending) |
| bucket | `main` | `loan` |
| `auto` | True — FIFO may choose it beside invoices | False — explicit allocations only |
| open | `due`/`overdue`, outstanding > 0 | the same; `scheduled` too for an explicit prepayment (EC-2) |

Document-mode dues are not targets (EC-3): they are settled through their
invoice and follow it through the `dues_due` origin listener (`origins.py`).

── Lock order ──────────────────────────────────────────────────────────────
`(due_on, seq, id)`, the same order the daily run locks a schedule's dues in, so
a collection, a void and the run never take two dues in opposite orders. The
protocol's merge key reads `document_date` and `number` off each row: they are
set on every row this module returns, `document_date = due_on` and `number =
"<subject> · <period>"`, the label a receipt prints. Two dues of DIFFERENT
schedules on one date therefore merge by label, while their locks are taken by
`seq` — harmless, because every path locks through `lock()` and only the FIFO
choice reads the merge (C-25 in the Track D progress file).
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.db.models import QuerySet

from apps.common.audit import AuditAction
from apps.common.constants import LedgerBucket
from apps.dues.constants import OPEN_DUE_STATUSES, DueStatus, Mode, Posting
from apps.dues.models import DuesDue, DuesSchedule
from apps.dues.services import settlement
from apps.dues.services.settlement import TARGET_DUE, TARGET_INSTALMENT, outstanding

_ORDER = ("due_on", "seq", "id")


def _decorate(dues: list[DuesDue]) -> list[DuesDue]:
    """Give each due its schedule and the protocol's `document_date` / `number`."""
    from apps.dues.origins import _labels_for

    if not dues:
        return dues
    schedules = {s.pk: s for s in DuesSchedule.objects.filter(pk__in={d.schedule_id for d in dues})}
    for due in dues:
        due.schedule = schedules[due.schedule_id]
    labels = _labels_for(dues)
    for due in dues:
        due.document_date = due.due_on
        due.number = labels.get(due.id) or due.period_label
    return dues


class _DuesTargetBase:
    direction = "in"
    document_type: str
    bucket: str
    auto: bool
    #: Statuses an explicit allocation may settle.
    _open_statuses: tuple[str, ...] = OPEN_DUE_STATUSES

    def _rows(self, tenant: Any) -> QuerySet:
        raise NotImplementedError

    def _listed(self, rows: QuerySet) -> list[DuesDue]:
        return _decorate(list(rows.prefetch_related("components").order_by(*_ORDER)))

    def open_documents(self, *, tenant: Any, party_id: Any) -> list[Any]:
        rows = self._rows(tenant).filter(party_id=party_id, status__in=OPEN_DUE_STATUSES)
        return [due for due in self._listed(rows) if outstanding(due) > 0]

    def find(self, *, tenant: Any, ids: list[Any]) -> list[Any]:
        return self._listed(self._rows(tenant).filter(pk__in=ids))

    def lock(self, *, tenant: Any, ids: list[Any]) -> list[Any]:
        rows = self._rows(tenant).select_for_update(of=("self",)).filter(pk__in=ids)
        return self._listed(rows)

    def lock_open_for_party(self, *, tenant: Any, party_id: Any) -> list[Any]:
        rows = (
            self._rows(tenant)
            .select_for_update(of=("self",))
            .filter(party_id=party_id, status__in=OPEN_DUE_STATUSES)
        )
        return [due for due in self._listed(rows) if outstanding(due) > 0]

    def is_open(self, document: Any) -> bool:
        return document.status in self._open_statuses and outstanding(document) > 0

    def outstanding(self, document: Any) -> Decimal:
        return outstanding(document)

    def party_id(self, document: Any) -> Any:
        return document.party_id

    def apply(
        self,
        *,
        document: Any,
        amount: Decimal,
        today: dt.date,
        payment_id: Any = None,
        ctx: Any = None,
    ) -> tuple[str, str]:
        return settlement.settle(
            ctx=ctx, due=document, amount=amount, today=today, payment_id=payment_id
        )

    def unapply(
        self,
        *,
        document: Any,
        amount: Decimal,
        today: dt.date,
        payment_id: Any = None,
        ctx: Any = None,
    ) -> tuple[str, str]:
        return settlement.unsettle(
            ctx=ctx, due=document, amount=amount, today=today, payment_id=payment_id
        )

    def summary(self, document: Any) -> dict:
        label = getattr(document, "number", None) or document.period_label
        owed = (
            Decimal(document.amount)
            + Decimal(document.penalty_amount)
            - Decimal(document.waived_amount)
        )
        return {
            "document_type": self.document_type,
            "document_id": str(document.id),
            "kind": "due",
            "number": label,
            "label": label[:120],
            "document_date": document.due_on.isoformat(),
            "due_on": document.due_on.isoformat(),
            "grand_total": str(owed),
            "amount_due": str(outstanding(document)),
            "status": document.status,
        }

    def audit_action(self) -> str:
        return AuditAction.DUES_DUE_STATUS_CHANGED


class DuesDueTarget(_DuesTargetBase):
    """A charge-mode due posted to the ledger: FIFO may settle it, in `shop` (BR-7, DEC-019)."""

    document_type = TARGET_DUE
    bucket = LedgerBucket.SHOP.value
    auto = True

    def _rows(self, tenant: Any) -> QuerySet:
        return DuesDue.objects.filter(
            tenant=tenant, schedule__posting=Posting.LEDGER, schedule__mode=Mode.CHARGE
        )


class DuesInstalmentTarget(_DuesTargetBase):
    """An expectation-mode instalment: explicit only, in `loan`; a prepayment of one not yet
    due is the vertical's call, made through `plan_allocation(allow_scheduled=True)` (EC-2)."""

    document_type = TARGET_INSTALMENT
    bucket = LedgerBucket.LOAN.value
    auto = False
    _open_statuses = (*OPEN_DUE_STATUSES, DueStatus.SCHEDULED.value)

    def _rows(self, tenant: Any) -> QuerySet:
        return DuesDue.objects.filter(tenant=tenant, schedule__mode=Mode.EXPECTATION)


def register_dues_targets() -> None:
    """Called from `DuesConfig.ready()` (ADR-056: the owner registers its targets)."""
    from apps.payments.services.targets import register_target

    register_target(DuesDueTarget())
    register_target(DuesInstalmentTarget())
