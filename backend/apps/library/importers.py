"""QA F10 — the library's students, brought in from the paper register.

Each row is an EXISTING student (QA F1): they joined on a day, have paid till a
day, may have handed over a deposit long ago and may still owe something. The
commit calls `members.enrol(existing_student=True)` per row — the very call the
admission drawer's "Already a student" switch makes — so no fee is charged, no
money is counted as today's, the deposit comes in as an opening adjustment and
old dues as a charge on their own date. Nothing here writes a model.

A mobile already in the book is the SAME person (DEC-019: the name and mobile are
the one shared record), so the row enrols that party rather than refusing — unless
they are already a member, which is an error naming their number.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from apps.imports.registry import (
    CoerceError,
    ColumnSpec,
    ImporterSpec,
    RowResult,
    coerce,
)
from apps.imports.registry import register as register_importer

NAME_MIN = 2
NAME_MAX = 160
MONEY_MAX = 9_999_999

COLUMNS = (
    ColumnSpec(
        "name",
        required=True,
        help="required; the student's name",
        aliases=("student", "student_name", "member", "member_name", "नाम"),
    ),
    ColumnSpec(
        "mobile",
        help="10-digit mobile; +91 is optional",
        aliases=("phone", "mobile_no", "mobile_number", "contact", "फ़ोन"),
    ),
    ColumnSpec(
        "plan",
        help="your plan's name as in Settings; blank if you have only one",
        aliases=("membership", "membership_type", "plan_name"),
    ),
    ColumnSpec(
        "joined",
        help="dd/mm/yyyy; the day they joined (blank means today)",
        aliases=("joined_on", "join_date", "admission_date", "start_date", "starts_on"),
        kind="date",
    ),
    ColumnSpec(
        "paid_till",
        help="dd/mm/yyyy; fees are paid up to this day",
        aliases=("paid_until", "valid_till", "valid_until", "expiry", "fee_paid_till"),
        kind="date",
    ),
    ColumnSpec(
        "deposit",
        help="security money they gave you, e.g. 500",
        aliases=("deposit_held", "security", "security_deposit"),
        kind="money",
    ),
    ColumnSpec(
        "old_dues",
        help="money they still owe from the old register, e.g. 300",
        aliases=("dues", "balance", "pending", "baaki", "बाक़ी"),
        kind="money",
    ),
    ColumnSpec(
        "seat",
        help="seat number as on your seat map, e.g. A-12",
        aliases=("seat_no", "seat_number"),
    ),
    ColumnSpec(
        "shift", help="shift name as in Settings, e.g. Morning", aliases=("timing", "batch")
    ),
    ColumnSpec(
        "member_number",
        help="their old register number; blank to give the next one",
        aliases=("number", "roll", "roll_no", "id", "member_no"),
    ),
)

TEMPLATE_ROWS = (
    {
        "name": "Priya Sharma",
        "mobile": "9876543210",
        "plan": "Monthly",
        "joined": "01/06/2026",
        "paid_till": "30/11/2026",
        "deposit": "500",
        "old_dues": "",
        "seat": "A-12",
        "shift": "Morning",
    },
    {
        "name": "Rahul Verma",
        "mobile": "9812345678",
        "plan": "Monthly",
        "joined": "15/08/2026",
        "paid_till": "14/10/2026",
        "old_dues": "300",
    },
)


def _key(value: str) -> str:
    return " ".join(value.lower().split())


def _mobile_key(stored: str) -> str:
    try:
        return coerce.mobile(stored) or stored
    except CoerceError:
        return stored


def preflight(tenant: Any) -> dict:
    """Plans, shifts, seats, who holds which seat, and who is already a member."""
    from apps.common.dates import tenant_today
    from apps.library.models import (
        LibraryMembership,
        LibraryMembershipType,
        LibrarySeat,
        LibraryShift,
    )
    from apps.library.services import codes
    from apps.library.services.seats import _holders
    from apps.parties.models import Party

    plans = list(LibraryMembershipType.objects.filter(tenant=tenant, is_active=True))
    members = {
        str(party_id): number
        for party_id, number in LibraryMembership.objects.filter(tenant=tenant).values_list(
            "party_id", "member_number"
        )
    }
    member_names = {
        _key(name): name
        for name in LibraryMembership.objects.filter(tenant=tenant)
        .values_list("party__name", flat=True)
        .iterator(chunk_size=2000)
        if name
    }
    parties = {
        _mobile_key(mobile): (str(pk), name)
        for pk, mobile, name in Party.objects.filter(tenant=tenant, mobile__isnull=False)
        .values_list("id", "mobile", "name")
        .iterator(chunk_size=2000)
    }
    numbers = {
        codes.number_key(n)
        for n in LibraryMembership.objects.filter(tenant=tenant).values_list(
            "member_number", flat=True
        )
    }
    held: dict[str, list[Any]] = {}
    for m in _holders(tenant):
        held.setdefault(str(m.seat_id), []).append(m.shift)
    return {
        "tenant": tenant,
        "today": tenant_today(tenant),
        "plans": {_key(p.name): p for p in plans},
        "only_plan": plans[0] if len(plans) == 1 else None,
        "shifts": {
            _key(s.name): s for s in LibraryShift.objects.filter(tenant=tenant, is_active=True)
        },
        "seats": {_key(s.label): s for s in LibrarySeat.objects.filter(tenant=tenant)},
        "held": held,
        "members": members,
        "member_names": member_names,
        "parties": parties,
        "numbers": numbers,
    }


def _plan(ctx: dict, raw: str, result: RowResult) -> Any:
    if coerce.is_blank(raw):
        if ctx["only_plan"] is None:
            result.error("plan", "required", "Write the plan's name — you have more than one.")
        return ctx["only_plan"]
    plan = ctx["plans"].get(_key(coerce.text(raw)))
    if plan is None:
        result.error("plan", "unknown_plan", "No plan by this name. Add it in Settings first.")
    return plan


def _placement(ctx: dict, row: dict[str, str], result: RowResult) -> tuple[Any, Any]:
    from apps.library.services.seats import overlaps

    shift = seat = None
    raw_shift = row.get("shift", "")
    if not coerce.is_blank(raw_shift):
        shift = ctx["shifts"].get(_key(coerce.text(raw_shift)))
        if shift is None:
            result.error("shift", "unknown_shift", "No shift by this name. Add it in Settings.")
    raw_seat = row.get("seat", "")
    if not coerce.is_blank(raw_seat):
        seat = ctx["seats"].get(_key(coerce.text(raw_seat)))
        if seat is None:
            result.error("seat", "unknown_seat", "No seat with this number on your seat map.")
        elif not seat.is_active:
            result.error("seat", "seat_off", "This seat is not in use.")
            seat = None
        elif any(overlaps(shift, other) for other in ctx["held"].get(str(seat.id), [])):
            result.error("seat", "seat_taken", "Seat already taken in this shift.")
            seat = None
    return seat, shift


def validate_row(ctx: dict, row: dict[str, str], number: int) -> RowResult:
    from apps.library.services import codes

    result = RowResult()
    clean: dict[str, Any] = {}

    def attempt(column: str, fn: Any, *args: Any, **kwargs: Any) -> Any:
        try:
            return fn(row.get(column, ""), *args, **kwargs)
        except CoerceError as exc:
            result.error(column, exc.code, exc.message)
            return None

    name = " ".join(coerce.text(row.get("name")).split())
    if not NAME_MIN <= len(name) <= NAME_MAX:
        result.error("name", "invalid_name", "Enter a name (2–160 characters).")

    mobile = attempt("mobile", coerce.mobile)
    party_id = None
    if mobile:
        found = ctx["parties"].get(mobile)
        if found is not None:
            party_id = found[0]
            if party_id in ctx["members"]:
                result.error(
                    "mobile",
                    "already_member",
                    f"{found[1]} is already member {ctx['members'][party_id]}.",
                )
    elif name and _key(name) in ctx["member_names"]:
        result.duplicate = ctx["member_names"][_key(name)]

    plan = _plan(ctx, row.get("plan", ""), result)
    joined = attempt("joined", coerce.date_value, today=ctx["today"]) or ctx["today"]
    paid_till = attempt("paid_till", coerce.date_value)
    if paid_till is not None and paid_till < joined:
        result.error("paid_till", "invalid_date", "Paid till is before the day they joined.")
    if paid_till is None and plan is not None and plan.validity_months and not result.errors:
        result.warn(
            "paid_till", "paid_till_assumed", "No paid-till date: one plan period from joining."
        )
    deposit = attempt("deposit", coerce.money, maximum=MONEY_MAX)
    dues = attempt("old_dues", coerce.money, maximum=MONEY_MAX)
    seat, shift = _placement(ctx, row, result)

    typed = attempt("member_number", coerce.optional_text, max_length=24)
    if typed:
        try:
            typed = codes.validate_number(typed)
        except codes.InvalidNumber as exc:
            result.error("member_number", "invalid_number", str(exc))
            typed = None
        else:
            if codes.number_key(typed) in ctx["numbers"]:
                result.error("member_number", "number_taken", "This number is already used.")

    if not result.errors and seat is not None:
        # Two rows of the same file on one seat and shift: the second is refused.
        ctx["held"].setdefault(str(seat.id), []).append(shift)

    clean = {
        "existing_student": True,
        "membership_type_id": str(plan.id) if plan is not None else None,
        "starts_on": joined.isoformat(),
        **({"valid_until": paid_till.isoformat()} if paid_till else {}),
        **({"party_id": party_id} if party_id else {"party": {"name": name, "mobile": mobile}}),
        **({"deposit_held": str(deposit)} if deposit else {}),
        **({"old_dues": {"amount": str(dues), "on": joined.isoformat()}} if dues else {}),
        **({"seat_id": str(seat.id)} if seat is not None else {}),
        **({"shift_id": str(shift.id)} if shift is not None else {}),
        **({"member_number": typed} if typed else {}),
    }
    result.clean = clean
    result.tally = {
        "students": 1,
        "deposits": deposit or Decimal("0.00"),
        "old_dues": dues or Decimal("0.00"),
    }
    result.preview = {
        "name": name,
        "mobile": mobile,
        "plan": plan.name if plan is not None else None,
        "joined": joined.isoformat(),
        "paid_till": paid_till.isoformat() if paid_till else None,
        "deposit": str(deposit) if deposit else None,
        "old_dues": str(dues) if dues else None,
        "seat": seat.label if seat is not None else None,
        "shift": shift.name if shift is not None else None,
    }
    return result


def commit_rows(ctx: dict, service_ctx: Any, rows: list[tuple[int, dict]], progress: Any) -> dict:
    """`enrol(existing_student=True)` per row, in file order."""
    from apps.library.services.members import enrol

    created = 0
    deposits = Decimal("0.00")
    dues = Decimal("0.00")
    for index, (_number, clean) in enumerate(rows, start=1):
        enrol(ctx=service_ctx, data=dict(clean))
        created += 1
        deposits += Decimal(clean.get("deposit_held") or 0)
        dues += Decimal((clean.get("old_dues") or {}).get("amount") or 0)
        progress(index)
    return {
        "created_students": created,
        "deposits_held": f"{deposits:.2f}",
        "old_dues": f"{dues:.2f}",
    }


def preview_totals(ctx: dict) -> dict:
    tally = ctx.get("tally") or {}
    return {
        "deposits_held": f"{Decimal(tally.get('deposits') or 0):.2f}",
        "old_dues": f"{Decimal(tally.get('old_dues') or 0):.2f}",
    }


def register() -> ImporterSpec:
    """Called from the app's `ready()` (R27)."""
    return register_importer(
        ImporterSpec(
            kind="students",
            label="imports.kind.students",
            columns=COLUMNS,
            template_rows=TEMPLATE_ROWS,
            required_permissions=("library.member.write",),
            read_permission="library.member.read",
            preflight=preflight,
            validate_row=validate_row,
            commit_rows=commit_rows,
            unique_columns=("mobile", "member_number"),
            max_rows=5_000,
            modules=("library",),
            summary_fields=("created_students", "deposits_held", "old_dues"),
            records_route="/library/members",
            totals=preview_totals,
        )
    )
