"""QR self check-in for a reading room (Library P0; competitors check students in by QR).

The library prints ONE poster for its door: a QR of `{UB_PUBLIC_BASE_URL}/in/<token>`.
A student scans it with their own phone's camera, types their student number and the
last four digits of their mobile, and is checked in — a VISIT mark on the attendance
engine with method `qr`, exactly what the desk's tap writes, so the day's register,
the month strip and every rule (one visit a day, a student who left is refused, a
late fee is a warning) are the desk's own.

── Why a number AND four digits ─────────────────────────────────────────────
The poster is public: anyone in the room can scan it. The student number alone is
printed on cards and seen across a desk; the mobile's last four are not on the card.
Both must match one current student, and a mismatch says only "not found" — the page
is not an oracle for which numbers exist. Failed tries are budgeted per IP and per
poster by the public-link throttles.

── The token ────────────────────────────────────────────────────────────────
Signed (`django.core.signing`, no expiry — a poster stays on the wall) over the
tenant's id and nothing else, so it cannot be edited to point at another library.
The page shows the library's name, never the product's.
"""

from __future__ import annotations

import uuid
from typing import Any

from django.conf import settings
from django.core import signing

from apps.common.exceptions import BusinessRuleViolation, NotFound, ValidationFailed
from apps.common.qr import encode, matrix_rows

SALT = "ub.library.self-checkin"
NOT_FOUND = "This check-in code is not in use."


def _signer() -> signing.Signer:
    return signing.Signer(salt=SALT, sep=".")


def poster(tenant: Any) -> dict:
    """`{url, qr, library}` — what the desk prints for the door."""
    token = _signer().sign(tenant.id.hex)
    base = str(getattr(settings, "UB_PUBLIC_BASE_URL", "")).rstrip("/")
    url = f"{base}/in/{token}"
    matrix = encode(url)
    return {
        "url": url,
        "library": tenant.name,
        "qr": {"size": len(matrix), "modules": matrix_rows(matrix)},
    }


def tenant_of(token: str) -> Any:
    from apps.platform_app.models import Tenant

    if not token or len(token) > 128:
        raise NotFound(NOT_FOUND)
    try:
        tenant_id = uuid.UUID(hex=_signer().unsign(token))
    except (signing.BadSignature, ValueError) as error:
        raise NotFound(NOT_FOUND) from error
    tenant = Tenant.objects.filter(pk=tenant_id).exclude(status="deleted").first()
    if tenant is None or "library" not in (tenant.enabled_modules or []):
        raise NotFound(NOT_FOUND)
    return tenant


def page(token: str) -> dict:
    return {"library": tenant_of(token).name}


def _digits(raw: Any) -> str:
    return "".join(ch for ch in str(raw or "") if ch.isdigit())


def check_in(*, token: str, member_number: Any, mobile_last4: Any) -> dict:
    """Find the one current student the two answers name, and check them in."""
    from apps.attendance.constants import Method
    from apps.attendance.services import marks
    from apps.common.context import Ctx
    from apps.library.constants import MembershipStatus
    from apps.library.models import LibraryMembership
    from apps.library.services.attendance import CONTEXT, MODULE, reading_room

    tenant = tenant_of(token)
    number = " ".join(str(member_number or "").split())
    last4 = _digits(mobile_last4)
    if not number or len(last4) != 4:
        raise ValidationFailed(
            {"member_number": ["Enter your student number and the last 4 digits of your mobile."]}
        )
    member = (
        LibraryMembership.objects.filter(tenant=tenant, member_number__iexact=number)
        .exclude(status=MembershipStatus.CLOSED)
        .select_related("party", "seat", "shift")
        .first()
    )
    if member is None or not _digits(member.party.mobile).endswith(last4):
        raise BusinessRuleViolation(
            "checkin_not_found",
            "We could not find you. Check the number, or ask at the desk.",
            details={},
        )
    ctx = Ctx.system(tenant)
    try:
        result = marks.check_in(
            ctx=ctx,
            module=MODULE,
            party_id=member.party_id,
            context_type=CONTEXT,
            context_id=member.id,
            group_id=reading_room(tenant).id,
            method=Method.QR,
        )
    except BusinessRuleViolation as error:
        if error.code == "attendance_duplicate":
            return _welcome(member, already=True, warning=None)
        if error.code == "attendance_blocked":
            raise BusinessRuleViolation(
                "checkin_see_desk",
                "Please see the desk before you come in.",
                details={},
            ) from error
        raise
    warning = result["reason"] if result["decision"] == "warn" else None
    return _welcome(member, already=False, warning=warning)


def _welcome(member: Any, *, already: bool, warning: str | None) -> dict:
    """What the student's phone shows: their first name and place, never anybody else's."""
    first = (member.party.name or "").split(" ")[0]
    return {
        "first_name": first,
        "already": already,
        "seat": member.seat.label if member.seat_id else None,
        "shift": member.shift.name if member.shift_id else None,
        "warning": warning,
    }
