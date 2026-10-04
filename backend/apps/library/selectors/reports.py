"""The eight library reports (LIB-12; task B15).

Each report is a `Report`: a filter parser, a row source, the columns and the
totals. `register()` publishes them on the core reports seam
(`register_report`, keys `library.<name>`), so `GET /reports` lists them and
`GET /reports/library.<name>?format=csv` exports them through the core export
rules (BOM, CRLF, the `export` budget spent on the FILE only — the LED-04
lesson). `/library/reports/<name>` is the module's own screen endpoint: the
same JSON paged, and `/print`, the unpaged rows capped at 2,000.

Totals are over the FILTERED set, never the page (FR-2). Money is a 2-dp string
in JSON and a `Decimal` in CSV; dates are ISO in JSON and dd/mm/yyyy in CSV.

Two reports are evaluated on the records as they are now rather than as of a
past date — deposits and no dues — because neither a held deposit nor a charge's
`amount_due` keeps its history in a column; the movement tables could rebuild
it and that is LIB-12's "Later". Their `as_of` is today and the screen says so.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from django.db.models import Count, OuterRef, Q, Subquery, Sum
from django.db.models.functions import Coalesce

from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.common.money import ZERO
from apps.library.constants import ChargeKind, CopyStatus, MaterialType
from apps.library.services.fields import uuid_or_none

PAGE_SIZE_DEFAULT = 50
PAGE_SIZE_MAX = 200
PRINT_MAX = 2000
CIRCULATION_MAX_DAYS = 366


@dataclass(frozen=True)
class Column:
    key: str
    kind: str = "text"  # text | number | money | date

    @property
    def label_id(self) -> str:
        return f"library.report.col.{self.key}"


@dataclass(frozen=True)
class Report:
    name: str
    columns: tuple[Column, ...]
    parse: Callable[[Any, dict], dict]
    rows: Callable[[Any, dict], Iterable[dict]]
    totals: Callable[[Any, dict, list[dict]], dict]
    orientation: str = "portrait"
    #: The rows a CSV carries when they differ from the screen's (verification: the missing list).
    csv_columns: tuple[Column, ...] | None = field(default=None)

    @property
    def key(self) -> str:
        return f"library.{self.name}"

    @property
    def label_id(self) -> str:
        return f"library.report.{self.name}"


# ── filters ─────────────────────────────────────────────────────────────────


class _Filters:
    def __init__(self, params: dict) -> None:
        self.params = params or {}
        self.errors: dict[str, list[str]] = {}

    def text(self, name: str) -> str:
        return (self.params.get(name) or "").strip()

    def date(self, name: str, default: dt.date | None = None) -> dt.date | None:
        raw = self.text(name)
        if not raw:
            return default
        try:
            return dt.date.fromisoformat(raw)
        except ValueError:
            self.errors[name] = ["Use a date like 2026-04-01."]
            return default

    def choice(self, name: str, choices: Iterable[str]) -> str:
        value = self.text(name)
        if value and value not in set(choices):
            self.errors[name] = ["Not one of the choices."]
            return ""
        return value

    def uuid(self, name: str) -> Any:
        raw = self.text(name)
        if not raw:
            return None
        value = uuid_or_none(raw)
        if value is None:
            self.errors[name] = ["Not a valid id."]
        return value

    def number(self, name: str) -> int | None:
        raw = self.text(name)
        if not raw:
            return None
        if not raw.isdigit():
            self.errors[name] = ["Send a whole number."]
            return None
        return int(raw)

    def period(self, today: dt.date, *, required: bool, max_days: int | None = None) -> tuple:
        start, end = self.date("from"), self.date("to")
        if required and (start is None or end is None):
            self.errors.setdefault("from", ["Choose a period."])
        if start and end:
            if end < start:
                self.errors["to"] = ["The period ends before it starts."]
            elif max_days and (end - start).days + 1 > max_days:
                self.errors["to"] = [f"At most {max_days} days at a time."]
        return start, end

    def done(self, clean: dict) -> dict:
        if self.errors:
            raise ValidationFailed(self.errors)
        return {key: value for key, value in clean.items() if value not in (None, "")}


def _money(value: Any) -> str:
    return f"{Decimal(value or 0):.2f}"


# ── 1. accession register ───────────────────────────────────────────────────


def _parse_accession(tenant: Any, params: dict) -> dict:
    from apps.library.services import codes

    f = _Filters(params)
    low, high = f.text("range_from"), f.text("range_to")
    if low and high and codes.natural_sort_key(low) > codes.natural_sort_key(high):
        f.errors["range_to"] = ["The range ends before it starts."]
    return f.done(
        {
            "range_from": low,
            "range_to": high,
            "acquired_from": f.date("acquired_from"),
            "acquired_to": f.date("acquired_to"),
            "status": f.choice("status", CopyStatus.values),
            "category": f.uuid("category"),
        }
    )


def _accession_qs(tenant: Any, filters: dict) -> Any:
    from apps.library.models import LibraryCopy
    from apps.library.services import codes

    qs = LibraryCopy.objects.filter(tenant=tenant).select_related("title", "location")
    if filters.get("range_from"):
        qs = qs.filter(accession_sort__gte=codes.natural_sort_key(filters["range_from"]))
    if filters.get("range_to"):
        qs = qs.filter(accession_sort__lte=codes.natural_sort_key(filters["range_to"]))
    if filters.get("acquired_from"):
        qs = qs.filter(acquired_on__gte=filters["acquired_from"])
    if filters.get("acquired_to"):
        qs = qs.filter(acquired_on__lte=filters["acquired_to"])
    if filters.get("status"):
        qs = qs.filter(status=filters["status"])
    if filters.get("category"):
        qs = qs.filter(title__category_id=filters["category"])
    return qs.order_by("accession_sort", "id")


def _accession_rows(tenant: Any, filters: dict) -> Iterable[dict]:
    for copy in _accession_qs(tenant, filters).iterator(chunk_size=2000):
        yield {
            "accession_number": copy.accession_number,
            "title": copy.title.title,
            "authors": copy.title.authors,
            "publisher": copy.title.publisher,
            "year": copy.title.year,
            "acquired_on": copy.acquired_on,
            "source": copy.source,
            "source_note": copy.source_note,
            "price": copy.price,
            "location": copy.location.code if copy.location_id else copy.location_text,
            "status": copy.status,
            "withdrawn_on": copy.withdrawn_on,
            "withdrawn_reason": copy.withdrawn_reason or "",
        }


def _accession_totals(tenant: Any, filters: dict, _rows: list) -> dict:
    agg = _accession_qs(tenant, filters).aggregate(
        copies=Count("id"),
        value=Coalesce(Sum("price", filter=~Q(status=CopyStatus.WITHDRAWN)), ZERO),
    )
    return {"copies": agg["copies"], "value": _money(agg["value"])}


ACCESSION = Report(
    name="accession_register",
    columns=tuple(
        Column(key, kind)
        for key, kind in (
            ("accession_number", "text"),
            ("title", "text"),
            ("authors", "text"),
            ("publisher", "text"),
            ("year", "number"),
            ("acquired_on", "date"),
            ("source", "text"),
            ("source_note", "text"),
            ("price", "money"),
            ("location", "text"),
            ("status", "text"),
            ("withdrawn_on", "date"),
            ("withdrawn_reason", "text"),
        )
    ),
    parse=_parse_accession,
    rows=_accession_rows,
    totals=_accession_totals,
    orientation="landscape",
)


# ── 2. circulation ──────────────────────────────────────────────────────────


def _parse_circulation(tenant: Any, params: dict) -> dict:
    from apps.library.constants import LoanStatus

    f = _Filters(params)
    start, end = f.period(tenant_today(tenant), required=True, max_days=CIRCULATION_MAX_DAYS)
    return f.done(
        {
            "from": start,
            "to": end,
            "group": f.text("group"),
            "type": f.uuid("type"),
            "status": f.choice("status", LoanStatus.values),
        }
    )


def _circulation_qs(tenant: Any, filters: dict) -> Any:
    from apps.library.models import LibraryCharge, LibraryLoan

    qs = LibraryLoan.objects.filter(
        tenant=tenant, issued_on__gte=filters["from"], issued_on__lte=filters["to"]
    )
    # T-LIB-12-1 — a cancelled issue was never a loan; shown only when asked for.
    qs = (
        qs.filter(status=filters["status"])
        if filters.get("status")
        else qs.exclude(status="cancelled")
    )
    if filters.get("group"):
        qs = qs.filter(membership__group_label__iexact=filters["group"])
    if filters.get("type"):
        qs = qs.filter(membership__membership_type_id=filters["type"])
    fines = (
        LibraryCharge.objects.filter(
            loan=OuterRef("pk"), kind=ChargeKind.OVERDUE_FINE, reversed_at__isnull=True
        )
        .values("loan")
        .annotate(total=Sum("amount"))
        .values("total")
    )
    return (
        qs.annotate(fine_charged=Coalesce(Subquery(fines), ZERO))
        .select_related("copy", "copy__title", "membership", "membership__party", "created_by")
        .order_by("issued_on", "issued_at", "id")
    )


def _days_late(loan: Any) -> int:
    end = loan.returned_on or loan.lost_on
    return max((end - loan.due_on).days, 0) if end else 0


def _circulation_rows(tenant: Any, filters: dict) -> Iterable[dict]:
    for loan in _circulation_qs(tenant, filters).iterator(chunk_size=2000):
        user = loan.created_by
        yield {
            "issued_on": loan.issued_on,
            "member_number": loan.membership.member_number,
            "member_name": loan.membership.party.name,
            "group_label": loan.membership.group_label,
            "accession_number": loan.copy.accession_number,
            "title": loan.copy.title.title,
            "due_on": loan.due_on,
            "returned_on": loan.returned_on,
            "status": loan.status,
            "days_late": _days_late(loan),
            "fine_charged": loan.fine_charged,
            "renewals": loan.renew_count,
            "issued_by": (
                (getattr(user, "full_name", "") or getattr(user, "email", "")) if user else ""
            ),
        }


def _circulation_totals(tenant: Any, filters: dict, rows: list) -> dict:
    return {
        "loans": len(rows),
        "returned": sum(1 for row in rows if row["status"] == "returned"),
        "members": len({row["member_number"] for row in rows}),
        "fine_charged": _money(sum((row["fine_charged"] for row in rows), ZERO)),
    }


CIRCULATION = Report(
    name="circulation",
    columns=tuple(
        Column(key, kind)
        for key, kind in (
            ("issued_on", "date"),
            ("member_number", "text"),
            ("member_name", "text"),
            ("group_label", "text"),
            ("accession_number", "text"),
            ("title", "text"),
            ("due_on", "date"),
            ("returned_on", "date"),
            ("status", "text"),
            ("days_late", "number"),
            ("fine_charged", "money"),
            ("renewals", "number"),
            ("issued_by", "text"),
        )
    ),
    parse=_parse_circulation,
    rows=_circulation_rows,
    totals=_circulation_totals,
    orientation="landscape",
)


# ── 3. overdue ──────────────────────────────────────────────────────────────


def _parse_overdue(tenant: Any, params: dict) -> dict:
    f = _Filters(params)
    today = tenant_today(tenant)
    as_of = f.date("as_of", today)
    if as_of and as_of > today:
        f.errors["as_of"] = ["Choose today or an earlier date."]
    days = f.number("days_min")
    return f.done(
        {"as_of": as_of, "group": f.text("group"), "days_min": days, "type": f.uuid("type")}
    )


def _overdue_qs(tenant: Any, filters: dict) -> Any:
    """Out on `as_of` and past due then: issued by that day, not yet back, not lost by then."""
    from apps.library.models import LibraryLoan

    as_of = filters["as_of"]
    qs = (
        LibraryLoan.objects.filter(tenant=tenant, issued_on__lte=as_of, due_on__lt=as_of)
        .exclude(status="cancelled")
        .filter(Q(returned_on__isnull=True) | Q(returned_on__gt=as_of))
        .filter(Q(lost_on__isnull=True) | Q(lost_on__gt=as_of))
    )
    if filters.get("days_min"):
        qs = qs.filter(due_on__lte=as_of - dt.timedelta(days=filters["days_min"]))
    if filters.get("group"):
        qs = qs.filter(membership__group_label__iexact=filters["group"])
    if filters.get("type"):
        qs = qs.filter(membership__membership_type_id=filters["type"])
    return qs.select_related("copy", "copy__title", "membership", "membership__party").order_by(
        "membership__group_label", "membership__member_number_sort", "due_on", "id"
    )


def _overdue_rows(tenant: Any, filters: dict) -> Iterable[dict]:
    from apps.library.services.reminders import _fine_so_far

    as_of = filters["as_of"]
    loans = list(_overdue_qs(tenant, filters))
    last = _last_reminded(tenant, [loan.id for loan in loans], as_of)
    for loan in loans:
        yield {
            "member_number": loan.membership.member_number,
            "member_name": loan.membership.party.name,
            "group_label": loan.membership.group_label,
            "accession_number": loan.copy.accession_number,
            "title": loan.copy.title.title,
            "due_on": loan.due_on,
            "days_late": (as_of - loan.due_on).days,
            "fine_so_far": _fine_so_far(_as_open(loan), as_of),
            "last_reminded": last.get(loan.id),
        }


def _as_open(loan: Any) -> Any:
    """The fine to `as_of` is LIB-07's calculation for a loan still out on that day."""
    loan.status = "open"
    return loan


def _last_reminded(tenant: Any, loan_ids: list, as_of: dt.date) -> dict:
    from django.db.models import Max

    from apps.ledger.models import Reminder
    from apps.library.services.reminders import SOURCE_LOAN

    rows = (
        Reminder.objects.filter(tenant=tenant, source_type=SOURCE_LOAN, source_id__in=loan_ids)
        .exclude(status="cancelled")
        .filter(sent_at__isnull=False)
        .values("source_id")
        .annotate(at=Max("sent_at"))
    )
    return {row["source_id"]: row["at"].date() for row in rows if row["at"].date() <= as_of}


def _overdue_totals(tenant: Any, filters: dict, rows: list) -> dict:
    return {
        "loans": len(rows),
        "members": len({row["member_number"] for row in rows}),
        "fine_so_far": _money(sum((row["fine_so_far"] for row in rows), ZERO)),
    }


OVERDUE = Report(
    name="overdue",
    columns=tuple(
        Column(key, kind)
        for key, kind in (
            ("member_number", "text"),
            ("member_name", "text"),
            ("group_label", "text"),
            ("accession_number", "text"),
            ("title", "text"),
            ("due_on", "date"),
            ("days_late", "number"),
            ("fine_so_far", "money"),
            ("last_reminded", "date"),
        )
    ),
    parse=_parse_overdue,
    rows=_overdue_rows,
    totals=_overdue_totals,
)


# ── 4. fines and fees (BR-2) ────────────────────────────────────────────────


def _parse_fines(tenant: Any, params: dict) -> dict:
    f = _Filters(params)
    start, end = f.period(tenant_today(tenant), required=True)
    return f.done(
        {
            "from": start,
            "to": end,
            "kind": f.choice("kind", ChargeKind.values),
            "type": f.uuid("type"),
        }
    )


def _charges(tenant: Any, filters: dict) -> Any:
    from apps.library.models import LibraryCharge

    qs = LibraryCharge.objects.filter(tenant=tenant)
    if filters.get("kind"):
        qs = qs.filter(kind=filters["kind"])
    if filters.get("type"):
        qs = qs.filter(membership__membership_type_id=filters["type"])
    return qs


def fines_summary(tenant: Any, filters: dict) -> dict:
    """BR-2, per kind: charged, collected, waived, refunded in the period; open at its end."""
    from apps.library.models import LibraryWaiver
    from apps.payments.models import Allocation

    start, end = filters["from"], filters["to"]
    charges = _charges(tenant, filters)
    in_period = Q(charge_date__gte=start, charge_date__lte=end)
    by_kind: dict[str, dict[str, Decimal]] = {}

    def bucket(kind: str) -> dict[str, Decimal]:
        return by_kind.setdefault(
            kind,
            dict.fromkeys(("charged", "collected", "waived", "refunded", "open"), ZERO),
        )

    for row in (
        charges.filter(in_period, reversed_at__isnull=True)
        .values("kind")
        .annotate(total=Sum("amount"))
    ):
        bucket(row["kind"])["charged"] += row["total"]
    for row in (
        charges.filter(charge_date__lte=end, reversed_at__isnull=True)
        .values("kind")
        .annotate(total=Sum("amount_due"))
    ):
        bucket(row["kind"])["open"] += row["total"]
    kinds = dict(charges.values_list("id", "kind"))
    for row in (
        Allocation.objects.filter(
            tenant=tenant,
            document_type="library_charge",
            document_id__in=charges.values("id"),
            payment__status="recorded",
            payment__payment_date__gte=start,
            payment__payment_date__lte=end,
        )
        .values("document_id")
        .annotate(total=Sum("amount"))
    ):
        bucket(kinds[row["document_id"]])["collected"] += row["total"]
    for row in (
        LibraryWaiver.objects.filter(
            tenant=tenant,
            charge__in=charges,
            on_date__gte=start,
            on_date__lte=end,
            reversed_at__isnull=True,
        )
        .values("charge__kind", "kind")
        .annotate(total=Sum("amount"))
    ):
        key = "refunded" if row["kind"] == "found_refund" else "waived"
        bucket(row["charge__kind"])[key] += row["total"]
    return by_kind


def _fines_rows(tenant: Any, filters: dict) -> Iterable[dict]:
    qs = (
        _charges(tenant, filters)
        .filter(charge_date__gte=filters["from"], charge_date__lte=filters["to"])
        .filter(reversed_at__isnull=True)
        .select_related("membership", "membership__party")
        .order_by("charge_date", "number", "id")
    )
    for charge in qs.iterator(chunk_size=2000):
        yield {
            "charge_date": charge.charge_date,
            "number": charge.number,
            "kind": charge.kind,
            "member_number": charge.membership.member_number,
            "member_name": charge.membership.party.name,
            "description": charge.description,
            "amount": charge.amount,
            "amount_due": charge.amount_due,
        }


def _fines_totals(tenant: Any, filters: dict, _rows: list) -> dict:
    summary = fines_summary(tenant, filters)
    all_kinds = dict.fromkeys(("charged", "collected", "waived", "refunded", "open"), ZERO)
    for figures in summary.values():
        for key, value in figures.items():
            all_kinds[key] += value
    return {
        "by_kind": {
            kind: {key: _money(value) for key, value in figures.items()}
            for kind, figures in sorted(summary.items())
        },
        **{key: _money(value) for key, value in all_kinds.items()},
    }


FINES = Report(
    name="fines_fees",
    columns=tuple(
        Column(key, kind)
        for key, kind in (
            ("charge_date", "date"),
            ("number", "text"),
            ("kind", "text"),
            ("member_number", "text"),
            ("member_name", "text"),
            ("description", "text"),
            ("amount", "money"),
            ("amount_due", "money"),
        )
    ),
    parse=_parse_fines,
    rows=_fines_rows,
    totals=_fines_totals,
)


# ── 5. deposits (BR-3) ──────────────────────────────────────────────────────


def _parse_deposits(tenant: Any, params: dict) -> dict:
    f = _Filters(params)
    return f.done(
        {"status": f.choice("status", ("held", "released", "expected")), "type": f.uuid("type")}
    )


def _deposit_qs(tenant: Any, filters: dict) -> Any:
    from apps.library.models import LibraryMembership
    from apps.payments.services.deposits import deposits_for

    qs = deposits_for(tenant=tenant, module="library", status=filters.get("status") or None)
    if filters.get("type"):
        qs = qs.filter(
            subject_id__in=LibraryMembership.objects.filter(
                tenant=tenant, membership_type_id=filters["type"]
            ).values("id")
        )
    return qs.order_by("created_at", "id")


def _deposit_rows(tenant: Any, filters: dict) -> Iterable[dict]:
    from apps.library.models import LibraryMembership

    deposits = list(_deposit_qs(tenant, filters))
    numbers = dict(
        LibraryMembership.objects.filter(
            tenant=tenant, pk__in=[d.subject_id for d in deposits]
        ).values_list("id", "member_number")
    )
    for deposit in deposits:
        yield {
            "member_number": numbers.get(deposit.subject_id, ""),
            "member_name": deposit.party.name,
            "status": deposit.status,
            "expected": deposit.expected_amount,
            "received": deposit.received_amount,
            "applied": deposit.applied_amount,
            "refunded": deposit.refunded_amount,
            "held": deposit.held_amount,
        }


def _deposit_totals(tenant: Any, filters: dict, _rows: list) -> dict:
    agg = _deposit_qs(tenant, filters).aggregate(
        deposits=Count("id"),
        received=Coalesce(Sum("received_amount"), ZERO),
        applied=Coalesce(Sum("applied_amount"), ZERO),
        refunded=Coalesce(Sum("refunded_amount"), ZERO),
        held=Coalesce(Sum("held_amount"), ZERO),
    )
    # BR-3 — "money held for members, to be returned": a liability, never income.
    return {
        "deposits": agg.pop("deposits"),
        **{key: _money(value) for key, value in agg.items()},
        "as_of": tenant_today(tenant).isoformat(),
    }


DEPOSITS = Report(
    name="deposits",
    columns=tuple(
        Column(key, kind)
        for key, kind in (
            ("member_number", "text"),
            ("member_name", "text"),
            ("status", "text"),
            ("expected", "money"),
            ("received", "money"),
            ("applied", "money"),
            ("refunded", "money"),
            ("held", "money"),
        )
    ),
    parse=_parse_deposits,
    rows=_deposit_rows,
    totals=_deposit_totals,
)


# ── 6. stock summary (BR-5) ─────────────────────────────────────────────────


def _parse_stock(tenant: Any, params: dict) -> dict:
    f = _Filters(params)
    return f.done(
        {
            "category": f.uuid("category"),
            "material_type": f.choice("material_type", MaterialType.values),
            "location": f.uuid("location"),
        }
    )


def _stock_qs(tenant: Any, filters: dict) -> Any:
    from apps.library.models import LibraryCopy

    qs = LibraryCopy.objects.filter(tenant=tenant)
    if filters.get("category"):
        qs = qs.filter(title__category_id=filters["category"])
    if filters.get("material_type"):
        qs = qs.filter(title__material_type=filters["material_type"])
    if filters.get("location"):
        qs = qs.filter(location_id=filters["location"])
    return qs


def _stock_rows(tenant: Any, filters: dict) -> Iterable[dict]:
    live = ~Q(status=CopyStatus.WITHDRAWN)
    rows = (
        _stock_qs(tenant, filters)
        .values("status", "title__category__name", "title__material_type")
        .annotate(
            copies=Count("id"),
            value=Coalesce(Sum("price", filter=live), ZERO),
            unpriced=Count("id", filter=Q(price__isnull=True) & live),
        )
        .order_by("title__category__name", "title__material_type", "status")
    )
    for row in rows:
        yield {
            "category": row["title__category__name"] or "",
            "material_type": row["title__material_type"],
            "status": row["status"],
            "copies": row["copies"],
            "value": row["value"],
            "unpriced": row["unpriced"],
        }


def _stock_totals(tenant: Any, filters: dict, _rows: list) -> dict:
    live = ~Q(status=CopyStatus.WITHDRAWN)
    agg = _stock_qs(tenant, filters).aggregate(
        copies=Count("id", filter=live),
        value=Coalesce(Sum("price", filter=live), ZERO),
        unpriced=Count("id", filter=Q(price__isnull=True) & live),
        withdrawn=Count("id", filter=~live),
    )
    # BR-5 — copies without a price are counted, never valued at zero silently.
    return {**agg, "value": _money(agg["value"])}


STOCK = Report(
    name="stock_summary",
    columns=(
        Column("category"),
        Column("material_type"),
        Column("status"),
        Column("copies", "number"),
        Column("value", "money"),
        Column("unpriced", "number"),
    ),
    parse=_parse_stock,
    rows=_stock_rows,
    totals=_stock_totals,
)


# ── 7. a verification ───────────────────────────────────────────────────────


def _parse_verification(tenant: Any, params: dict) -> dict:
    from apps.library.models import LibraryVerification

    f = _Filters(params)
    pk = f.uuid("verification")
    if pk is None and "verification" not in f.errors:
        f.errors["verification"] = ["Choose a stock check."]
    if pk and not LibraryVerification.objects.filter(tenant=tenant, pk=pk).exists():
        f.errors["verification"] = ["No such stock check."]
    return f.done({"verification": pk})


def _verification_rows(tenant: Any, filters: dict) -> Iterable[dict]:
    from apps.library.services import verification as vf

    v = vf.get(tenant, filters["verification"])
    for copy in vf.missing_qs(v).select_related("title", "location").order_by("accession_sort"):
        yield {
            "accession_number": copy.accession_number,
            "title": copy.title.title,
            "location": copy.location.code if copy.location_id else copy.location_text,
            "status": copy.status,
            "price": copy.price,
            "high_value": "yes" if copy.price is not None and copy.price > vf.HIGH_VALUE else "",
        }


def _verification_totals(tenant: Any, filters: dict, _rows: list) -> dict:
    from apps.library.services import verification as vf

    v = vf.get(tenant, filters["verification"])
    return {
        **vf.verification_json(v),
        "loss": vf.loss_per_thousand(v) if v.status == "closed" else None,
    }


VERIFICATION = Report(
    name="verification",
    columns=(
        Column("accession_number"),
        Column("title"),
        Column("location"),
        Column("status"),
        Column("price", "money"),
        Column("high_value"),
    ),
    parse=_parse_verification,
    rows=_verification_rows,
    totals=_verification_totals,
    orientation="landscape",
)


# ── 8. no dues (LIB-13 BR-4) ────────────────────────────────────────────────


def _parse_no_dues(tenant: Any, params: dict) -> dict:
    f = _Filters(params)
    return f.done({"group": f.text("group"), "status": f.choice("status", ("clear", "not_clear"))})


def _no_dues_rows(tenant: Any, filters: dict) -> Iterable[dict]:
    from apps.library.models import LibraryMembership
    from apps.library.services.no_dues import evaluate_many

    members = LibraryMembership.objects.filter(tenant=tenant).select_related("party")
    if filters.get("group"):
        members = members.filter(group_label__iexact=filters["group"])
    members = list(members.order_by("group_label", "member_number_sort", "id"))
    for member, result in zip(members, evaluate_many(tenant, members), strict=True):
        status = "clear" if result["clear"] else "not_clear"
        if filters.get("status") and filters["status"] != status:
            continue
        yield {
            "member_number": member.member_number,
            "member_name": member.party.name,
            "group_label": member.group_label,
            "status": status,
            "books_out": result["books_out"],
            "lost_unpaid": result["lost_unpaid"],
            "dues": result["dues"],
        }


def _no_dues_totals(tenant: Any, filters: dict, rows: list) -> dict:
    return {
        "members": len(rows),
        "clear": sum(1 for row in rows if row["status"] == "clear"),
        "not_clear": sum(1 for row in rows if row["status"] == "not_clear"),
        "as_of": tenant_today(tenant).isoformat(),
    }


NO_DUES = Report(
    name="no_dues",
    columns=(
        Column("member_number"),
        Column("member_name"),
        Column("group_label"),
        Column("status"),
        Column("books_out", "number"),
        Column("lost_unpaid", "number"),
        Column("dues", "money"),
    ),
    parse=_parse_no_dues,
    rows=_no_dues_rows,
    totals=_no_dues_totals,
)


REPORTS: dict[str, Report] = {
    report.name: report
    for report in (ACCESSION, CIRCULATION, OVERDUE, FINES, DEPOSITS, STOCK, VERIFICATION, NO_DUES)
}


# ── serving ─────────────────────────────────────────────────────────────────


def _json_cell(value: Any) -> Any:
    if isinstance(value, Decimal):
        return f"{value:.2f}"
    if isinstance(value, dt.date):
        return value.isoformat()
    return value


def _csv_cell(value: Any) -> Any:
    if isinstance(value, dt.date):
        return value.strftime("%d/%m/%Y")
    if value is None:
        return ""
    return value


def _columns_json(report: Report) -> list[dict]:
    return [{"key": c.key, "label_id": c.label_id, "kind": c.kind} for c in report.columns]


def report_page(report: Report, tenant: Any, params: dict) -> dict:
    """The screen: one page of rows, totals over every filtered row."""
    filters = report.parse(tenant, params)
    page = max(int(params.get("page") or 1) if str(params.get("page") or "1").isdigit() else 1, 1)
    raw_size = str(params.get("page_size") or PAGE_SIZE_DEFAULT)
    size = min(int(raw_size), PAGE_SIZE_MAX) if raw_size.isdigit() and int(raw_size) else 50
    rows = list(report.rows(tenant, filters))
    window = rows[(page - 1) * size : page * size]
    return {
        "columns": _columns_json(report),
        "rows": [{k: _json_cell(v) for k, v in row.items()} for row in window],
        "totals": report.totals(tenant, filters, rows),
        "count": len(rows),
        "page": page,
        "page_size": size,
        "filters": {k: _json_cell(v) for k, v in filters.items()},
        "orientation": report.orientation,
    }


def report_print(report: Report, tenant: Any, params: dict) -> dict:
    """Every row, capped at 2,000 (EC-1: a register that long needs a range)."""
    filters = report.parse(tenant, params)
    rows = list(report.rows(tenant, filters))
    if len(rows) > PRINT_MAX:
        raise BusinessRuleViolation(
            "library_print_too_large",
            f"Print at most {PRINT_MAX:,} rows at a time — narrow the range.",
            details={"count": len(rows), "max": PRINT_MAX},
        )
    return {
        "columns": _columns_json(report),
        "rows": [{k: _json_cell(v) for k, v in row.items()} for row in rows],
        "totals": report.totals(tenant, filters, rows),
        "count": len(rows),
        "filters": {k: _json_cell(v) for k, v in filters.items()},
        "orientation": report.orientation,
    }


def report_csv(report: Report, tenant: Any, params: dict) -> Iterable[list]:
    filters = report.parse(tenant, params)
    yield [c.key for c in report.columns]
    for row in report.rows(tenant, filters):
        yield [_csv_cell(row.get(c.key)) for c in report.columns]


def register() -> None:
    from apps.reports.registry import register_report

    for report in REPORTS.values():
        register_report(
            report.key,
            module="library",
            permission="library.reports.read",
            label_id=report.label_id,
            selector=_bound(report_page, report),
            csv=_bound(report_csv, report),
        )


@dataclass(frozen=True)
class _bound:  # noqa: N801 — a callable value, equal by contents so a second ready() is a no-op
    fn: Callable
    report: Report

    def __call__(self, tenant: Any, params: dict) -> Any:
        return self.fn(self.report, tenant, params)
