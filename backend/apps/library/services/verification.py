"""Stock verification — start, scan, void, close, reopen, mark and withdraw missing (LIB-10).

── A scan never acts (FR-3) ──────────────────────────────────────────────────
Scanning a book that the system says is on loan does not return it; scanning a
lost one does not find it. The scan writes its own row and the copy's
`last_seen_on`, nothing else — the anomaly is for the librarian to read, and
LIB-07's Mark found is one tap away from the result.

── Close is set-based (T-LIB-10-6) ──────────────────────────────────────────
The expected set and the missing set are two queries over the scope, never a
query per copy, so a 20,000-volume close is a few statements. The scans are
re-classified at close against the copies as they are THEN (BR-1: a copy issued
during the count is on loan, not missing), and the counts written on the
verification are a cache that `recount` reproduces from the rows.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import Q, Sum
from django.db.models.functions import Coalesce, Upper
from django.utils import timezone

from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation, NotFound, StaleVersion
from apps.common.money import ZERO
from apps.library.constants import (
    EXPECTED_STATUSES,
    FLAGGED_STATUSES,
    SCAN_CODE_MAX,
    VERIFICATION_NAME_MAX,
    CopyEventReason,
    CopyStatus,
    ScanResult,
    VerificationScope,
    VerificationStatus,
)
from apps.library.models import (
    LibraryCategory,
    LibraryCopy,
    LibraryCopyEvent,
    LibraryLoan,
    LibraryLocation,
    LibraryVerification,
    LibraryVerificationScan,
)
from apps.library.services import codes, copy_status
from apps.library.services.fields import Errors, text, uuid_or_none

SOURCE_VERIFICATION = "library_verification"
#: BR-5 — a missing copy above this is "always investigated".
HIGH_VALUE = Decimal("1000.00")
#: BR-4 — the GFR norm the report states beside the figure.
LOSS_NORM_PER_THOUSAND = Decimal("5")
BUCKETS = ("missing", "wrong_location", "on_loan", "unknown", "flagged", "outside_scope")


# ── scope ───────────────────────────────────────────────────────────────────


def scope_q(v: LibraryVerification) -> Q:
    """The copies a verification covers, as a filter on `library_copy`."""
    if v.scope_kind == VerificationScope.LOCATIONS:
        return Q(location_id__in=v.location_ids)
    if v.scope_kind == VerificationScope.CATEGORIES:
        return Q(title__category_id__in=v.category_ids)
    if v.scope_kind == VerificationScope.RANGE:
        # EC-5 — "4512-A" falls between 4512 and 4513 by the natural sort key.
        return Q(
            accession_sort__gte=codes.natural_sort_key(v.range_from),
            accession_sort__lte=codes.natural_sort_key(v.range_to),
        )
    return Q()


def _in_scope(v: LibraryVerification) -> Any:
    return LibraryCopy.objects.filter(tenant_id=v.tenant_id).filter(scope_q(v))


def _ids(errors: Errors, tenant: Any, data: dict, key: str, model: Any) -> list:
    raw = data.get(key)
    if not isinstance(raw, list) or not raw:
        errors.add(key, "Choose at least one.")
        return []
    wanted = [uuid_or_none(value) for value in raw]
    if None in wanted:
        errors.add(key, "Not a valid id.")
        return []
    wanted = list(dict.fromkeys(wanted))
    if model.objects.filter(tenant=tenant, pk__in=wanted).count() != len(wanted):
        errors.add(key, "One of these does not exist.")
    return wanted


def _clean_start(tenant: Any, data: Any) -> dict:
    data = data if isinstance(data, dict) else {}
    errors = Errors()
    name = text(errors, data, "name", VERIFICATION_NAME_MAX)
    if not name:
        errors.add("name", "Give this stock check a name.")
    kind = data.get("scope_kind") or VerificationScope.ALL
    clean: dict[str, Any] = {"name": name, "scope_kind": kind}
    if kind not in VerificationScope.values:
        errors.add("scope_kind", "Choose all, locations, categories or range.")
    elif kind == VerificationScope.LOCATIONS:
        clean["location_ids"] = _ids(errors, tenant, data, "location_ids", LibraryLocation)
    elif kind == VerificationScope.CATEGORIES:
        clean["category_ids"] = _ids(errors, tenant, data, "category_ids", LibraryCategory)
    elif kind == VerificationScope.RANGE:
        low = (data.get("range_from") or "").strip()
        high = (data.get("range_to") or "").strip()
        for key, value in (("range_from", low), ("range_to", high)):
            if not value:
                errors.add(key, "Enter an accession number.")
            elif len(value) > 24:
                errors.add(key, "Too long.")
        if low and high and codes.natural_sort_key(low) > codes.natural_sort_key(high):
            errors.add("range_to", "The range ends before it starts.")
        clean.update(range_from=low, range_to=high)
    errors.raise_if_any()
    return clean


def overlaps(v: LibraryVerification) -> list[dict]:
    """FR-1 — other open verifications sharing at least one copy: a warning, not a refusal."""
    found = []
    others = LibraryVerification.objects.filter(
        tenant_id=v.tenant_id, status=VerificationStatus.OPEN
    ).exclude(pk=v.pk)
    for other in others.order_by("started_on", "id"):
        if _in_scope(v).filter(scope_q(other)).exists():
            found.append({"id": str(other.id), "name": other.name})
    return found


def expected_qs(v: LibraryVerification) -> Any:
    """BR-1 — on the shelf, or ought to be."""
    return _in_scope(v).filter(status__in=EXPECTED_STATUSES)


@transaction.atomic
def start(*, ctx: Any, data: Any) -> tuple[LibraryVerification, dict]:
    clean = _clean_start(ctx.tenant, data)
    v = LibraryVerification.objects.create(
        tenant=ctx.tenant,
        created_by=ctx.actor if ctx.actor_type == "user" else None,
        started_on=tenant_today(ctx.tenant),
        **clean,
    )
    return v, {"expected_count": expected_qs(v).count(), "overlaps": overlaps(v)}


def get(tenant: Any, verification_id: Any) -> LibraryVerification:
    v = LibraryVerification.objects.filter(tenant=tenant, pk=uuid_or_none(verification_id)).first()
    if v is None:
        raise NotFound("No such stock check.")
    return v


def _closed(v: LibraryVerification) -> BusinessRuleViolation:
    return BusinessRuleViolation(
        "library_verification_closed",
        "This stock check is closed.",
        details={"closed_on": v.closed_on.isoformat() if v.closed_on else None},
    )


def _still_open() -> BusinessRuleViolation:
    return BusinessRuleViolation(
        "library_verification_open", "Close the stock check first.", details={}
    )


# ── scanning (FR-2, BR-2) ───────────────────────────────────────────────────


def _find_copy(tenant: Any, code: str) -> LibraryCopy | None:
    found = codes.classify(code)
    if not found.number_key:
        return None
    for column in ("accession_number", "barcode"):
        copy = (
            LibraryCopy.objects.annotate(k=Upper(column))
            .filter(tenant=tenant, k=found.number_key)
            .select_related("title", "location")
            .first()
        )
        if copy is not None:
            return copy
    return None


def classify(
    v: LibraryVerification,
    copy: LibraryCopy | None,
    location_id: Any,
    *,
    in_scope: bool,
    seen_before: bool,
) -> str:
    """BR-2, in its order: unknown, outside scope, duplicate, flagged, on loan, wrong place."""
    if copy is None:
        return ScanResult.UNKNOWN_NUMBER
    if not in_scope:
        return ScanResult.OUTSIDE_SCOPE
    if seen_before:
        return ScanResult.DUPLICATE_SCAN
    if copy.status in FLAGGED_STATUSES:
        return ScanResult.FOUND_FLAGGED
    if copy.status == CopyStatus.ON_LOAN:
        return ScanResult.ON_LOAN
    if location_id and copy.location_id != location_id:
        return ScanResult.FOUND_WRONG_LOCATION
    return ScanResult.FOUND


def _message_params(copy: LibraryCopy | None, result: str) -> dict:
    if copy is None:
        return {}
    if result == ScanResult.FOUND_WRONG_LOCATION:
        return {"location": copy.location.code if copy.location_id else copy.location_text}
    if result == ScanResult.ON_LOAN:
        loan = (
            LibraryLoan.objects.filter(copy=copy, status="open")
            .select_related("membership__party")
            .first()
        )
        return {"member": loan.membership.party.name if loan else ""}
    if result == ScanResult.FOUND_FLAGGED:
        return {"status": copy.status}
    return {}


def scan_json(scan: LibraryVerificationScan, params: dict | None = None) -> dict:
    from apps.library import serializers as out

    return {
        "id": str(scan.id),
        "code_entered": scan.code_entered,
        "copy": out.copy_row(scan.copy) if scan.copy_id else None,
        "result": scan.result,
        "location_id": str(scan.location_id) if scan.location_id else None,
        "scanned_at": scan.scanned_at.isoformat(),
        "voided_at": scan.voided_at.isoformat() if scan.voided_at else None,
        "message_params": params if params is not None else {},
    }


def scan(*, ctx: Any, verification_id: Any, data: Any) -> tuple[LibraryVerificationScan, dict]:
    """BR-7 — locks nothing but its own insert; the verification is read, not locked."""
    data = data if isinstance(data, dict) else {}
    errors = Errors()
    code = (data.get("code") or "").strip()
    if not code:
        errors.add("code", "Scan or type a number.")
    elif len(code) > SCAN_CODE_MAX:
        errors.add("code", "That is too long to be a number here.")
    location_id = None
    if data.get("location_id"):
        location_id = uuid_or_none(data.get("location_id"))
        if (
            location_id is None
            or not LibraryLocation.objects.filter(tenant=ctx.tenant, pk=location_id).exists()
        ):
            errors.add("location_id", "No such location.")
    errors.raise_if_any()
    v = get(ctx.tenant, verification_id)
    if v.status != VerificationStatus.OPEN:
        raise _closed(v)
    copy = _find_copy(ctx.tenant, code)
    in_scope = copy is not None and _in_scope(v).filter(pk=copy.pk).exists()
    seen = (
        copy is not None
        and LibraryVerificationScan.objects.filter(
            verification=v, copy=copy, voided_at__isnull=True
        ).exists()
    )
    result = classify(v, copy, location_id, in_scope=in_scope, seen_before=seen)
    row = LibraryVerificationScan.objects.create(
        tenant=ctx.tenant,
        created_by=ctx.actor if ctx.actor_type == "user" else None,
        verification=v,
        code_entered=code,
        copy=copy,
        location_id=location_id,
        result=result,
        scanned_at=timezone.now(),
    )
    if copy is not None:
        LibraryCopy.objects.filter(pk=copy.pk).update(last_seen_on=tenant_today(ctx.tenant))
    return row, _message_params(copy, result)


@transaction.atomic
def void_scan(*, ctx: Any, verification_id: Any, scan_id: Any) -> LibraryVerificationScan:
    """FR-4 — the person who scanned, or someone holding `library.verification.close`."""
    from apps.common.exceptions import PermissionDenied
    from apps.library.services.loans import actor_can

    v = get(ctx.tenant, verification_id)
    if v.status != VerificationStatus.OPEN:
        raise _closed(v)
    row = (
        LibraryVerificationScan.objects.select_for_update(of=("self",))
        .filter(verification=v, pk=uuid_or_none(scan_id))
        .select_related("copy", "copy__title", "copy__location")
        .first()
    )
    if row is None:
        raise NotFound("No such scan.")
    if row.created_by_id != getattr(ctx.actor, "pk", None) and not actor_can(
        ctx, "library.verification.close"
    ):
        raise PermissionDenied("Only the person who scanned it, or an admin, can void a scan.")
    if row.voided_at is None:
        row.voided_at = timezone.now()
        row.voided_by = ctx.actor if ctx.actor_type == "user" else None
        row.save(update_fields=["voided_at", "voided_by"])
    return row


# ── counting and closing (FR-5, BR-1, BR-3) ─────────────────────────────────


def live_scans(v: LibraryVerification) -> Any:
    return LibraryVerificationScan.objects.filter(verification=v, voided_at__isnull=True)


def reclassify(v: LibraryVerification) -> None:
    """Every live scan's result against the copies as they are now, in scan order."""
    scope_ids = set(_in_scope(v).values_list("id", flat=True))
    seen: set = set()
    changed = []
    rows = live_scans(v).select_related("copy").order_by("scanned_at", "id")
    for row in rows:
        result = classify(
            v,
            row.copy,
            row.location_id,
            in_scope=row.copy_id in scope_ids,
            seen_before=row.copy_id in seen,
        )
        if row.copy_id is not None:
            seen.add(row.copy_id)
        if result != row.result:
            row.result = result
            changed.append(row)
    if changed:
        LibraryVerificationScan.objects.bulk_update(changed, ["result"])


def recount(v: LibraryVerification) -> dict:
    """The counts from the rows (T-LIB-10-2); voided scans never count."""
    scanned = live_scans(v).filter(copy__isnull=False).values("copy_id")
    missing = expected_qs(v).exclude(pk__in=scanned)
    by_result = dict.fromkeys(ScanResult.values, 0)
    for result in live_scans(v).values_list("result", flat=True):
        by_result[result] += 1
    value = missing.aggregate(total=Coalesce(Sum("price"), ZERO))["total"]
    return {
        "expected_count": expected_qs(v).count(),
        "found_count": by_result[ScanResult.FOUND],
        "wrong_location_count": by_result[ScanResult.FOUND_WRONG_LOCATION],
        "on_loan_count": _in_scope(v).filter(status=CopyStatus.ON_LOAN).count(),
        "missing_count": missing.count(),
        "unknown_count": by_result[ScanResult.UNKNOWN_NUMBER],
        "flagged_count": by_result[ScanResult.FOUND_FLAGGED],
        "outside_scope_count": by_result[ScanResult.OUTSIDE_SCOPE],
        "missing_value": value,
    }


def progress(v: LibraryVerification) -> dict:
    expected = expected_qs(v)
    scanned = live_scans(v).filter(copy__isnull=False).values("copy_id")
    scanned_expected = expected.filter(pk__in=scanned).count()
    return {
        "expected": expected.count(),
        "scanned_expected": scanned_expected,
        "extra": live_scans(v).count() - scanned_expected,
    }


def _locked(tenant: Any, verification_id: Any, version: Any = None) -> LibraryVerification:
    v = (
        LibraryVerification.objects.select_for_update()
        .filter(tenant=tenant, pk=uuid_or_none(verification_id))
        .first()
    )
    if v is None:
        raise NotFound("No such stock check.")
    if version is not None and str(version) != str(v.version):
        raise StaleVersion(v.version)
    return v


@transaction.atomic
def close(*, ctx: Any, verification_id: Any, data: Any = None) -> LibraryVerification:
    v = _locked(ctx.tenant, verification_id, (data or {}).get("version"))
    if v.status != VerificationStatus.OPEN:
        raise _closed(v)
    reclassify(v)
    for field, value in recount(v).items():
        setattr(v, field, value)
    v.status = VerificationStatus.CLOSED
    v.closed_on = tenant_today(ctx.tenant)
    v.version += 1
    v.save()
    return v


@transaction.atomic
def reopen(*, ctx: Any, verification_id: Any, data: Any) -> LibraryVerification:
    """FR-7 — once; the counts are recomputed at the next close."""
    data = data if isinstance(data, dict) else {}
    errors = Errors()
    reason = text(errors, data, "reason", 160) or ""
    if len(reason) < 3:
        errors.add("reason", "Say why the stock check is reopened.")
    errors.raise_if_any()
    v = _locked(ctx.tenant, verification_id)
    if v.status == VerificationStatus.OPEN:
        raise _still_open()
    if v.reopened:
        raise BusinessRuleViolation(
            "library_verification_reopen_used",
            "This stock check has been reopened once already. Start a new one.",
            details={},
        )
    v.status = VerificationStatus.OPEN
    v.closed_on = None
    v.reopened = True
    v.reopen_reason = reason
    v.version += 1
    v.save()
    return v


# ── results and acting on them (FR-5, FR-6) ─────────────────────────────────


def _acted_on(v: LibraryVerification) -> Any:
    return LibraryCopyEvent.objects.filter(
        tenant_id=v.tenant_id, source_type=SOURCE_VERIFICATION, source_id=v.id
    ).values("copy_id")


def missing_qs(v: LibraryVerification) -> Any:
    """Expected and not scanned — plus, once acted on, the copies this check marked
    missing or withdrew, so the list does not empty itself as the librarian works it."""
    scanned = live_scans(v).filter(copy__isnull=False).values("copy_id")
    return (
        _in_scope(v)
        .filter(Q(status__in=EXPECTED_STATUSES) | Q(pk__in=_acted_on(v)))
        .exclude(pk__in=scanned)
    )


def results(tenant: Any, verification_id: Any, bucket: str) -> list[dict]:
    from apps.common.exceptions import ValidationFailed
    from apps.library import serializers as out

    if bucket not in BUCKETS:
        raise ValidationFailed({"bucket": [f"Choose one of {', '.join(BUCKETS)}."]})
    v = get(tenant, verification_id)
    if bucket in ("missing", "on_loan"):
        qs = missing_qs(v) if bucket == "missing" else _in_scope(v).filter(status="on_loan")
        copies = qs.select_related("title", "location").order_by("accession_sort", "id")
        return [
            {
                "copy": out.copy_row(copy),
                "high_value": copy.price is not None and copy.price > HIGH_VALUE,
            }
            for copy in copies
        ]
    result = {
        "wrong_location": ScanResult.FOUND_WRONG_LOCATION,
        "unknown": ScanResult.UNKNOWN_NUMBER,
        "flagged": ScanResult.FOUND_FLAGGED,
        "outside_scope": ScanResult.OUTSIDE_SCOPE,
    }[bucket]
    rows = (
        live_scans(v)
        .filter(result=result)
        .select_related("copy", "copy__title", "copy__location")
        .order_by("scanned_at", "id")
    )
    return [scan_json(row) for row in rows]


def _chosen(v: LibraryVerification, data: dict, statuses: tuple) -> list[LibraryCopy]:
    from apps.common.exceptions import ValidationFailed

    qs = missing_qs(v).filter(status__in=statuses)
    if data.get("all") is True:
        return list(qs.order_by("accession_sort", "id"))
    raw = data.get("copy_ids")
    if not isinstance(raw, list) or not raw:
        raise ValidationFailed({"copy_ids": ["Choose copies, or all."]})
    wanted = [uuid_or_none(value) for value in raw]
    if None in wanted:
        raise ValidationFailed({"copy_ids": ["Not a valid id."]})
    return list(qs.filter(pk__in=wanted).order_by("accession_sort", "id"))


@transaction.atomic
def mark_missing(*, ctx: Any, verification_id: Any, data: Any) -> dict:
    """FR-6, BR-6 — status `missing` with this check as the source; charges nobody.

    A copy kept aside for a hold is left alone: it belongs to a member's ready hold,
    and moving it would leave that hold pointing at a book nobody can hand over.
    """
    data = data if isinstance(data, dict) else {}
    errors = Errors()
    reason = text(errors, data, "reason", 160) or ""
    errors.raise_if_any()
    v = _locked(ctx.tenant, verification_id)
    if v.status == VerificationStatus.OPEN:
        raise _still_open()
    chosen = _chosen(
        v, data, (CopyStatus.AVAILABLE, CopyStatus.IN_REPAIR, CopyStatus.ON_HOLD_SHELF)
    )
    today = tenant_today(ctx.tenant)
    marked, skipped = [], []
    for copy in chosen:
        if copy.status == CopyStatus.ON_HOLD_SHELF:
            skipped.append({"copy_id": str(copy.id), "reason": "kept_aside"})
            continue
        copy_status.move_copy(
            ctx=ctx,
            copy=copy,
            to_status=CopyStatus.MISSING,
            reason_code=CopyEventReason.MISSING,
            on_date=today,
            note=reason or v.name,
            source_type=SOURCE_VERIFICATION,
            source_id=v.id,
        )
        marked.append(str(copy.id))
    return {"marked": len(marked), "copy_ids": marked, "skipped": skipped}


@transaction.atomic
def withdraw_missing(*, ctx: Any, verification_id: Any, data: Any) -> dict:
    """FR-6 — withdrawn with reason `missing`; write-off approval is the library's process."""
    data = data if isinstance(data, dict) else {}
    errors = Errors()
    note = text(errors, data, "note", 160) or ""
    errors.raise_if_any()
    v = _locked(ctx.tenant, verification_id)
    if v.status == VerificationStatus.OPEN:
        raise _still_open()
    chosen = _chosen(v, data, (CopyStatus.AVAILABLE, CopyStatus.IN_REPAIR, CopyStatus.MISSING))
    today = tenant_today(ctx.tenant)
    done = []
    for copy in chosen:
        copy_status.move_copy(
            ctx=ctx,
            copy=copy,
            to_status=CopyStatus.WITHDRAWN,
            reason_code=CopyEventReason.WITHDRAWN,
            on_date=today,
            note=note or v.name,
            source_type=SOURCE_VERIFICATION,
            source_id=v.id,
            withdrawn_reason="missing",
        )
        done.append(copy.title_id)
        _after_withdrawal(ctx, copy.title_id)
    return {"withdrawn": len(done)}


def _after_withdrawal(ctx: Any, title_id: Any) -> None:
    """The catalogue's own rule for a last copy (LIB-02 FR-12, LIB-08 BR-7)."""
    from apps.library.constants import TitleStatus
    from apps.library.models import LibraryTitle
    from apps.library.services.catalogue import archive_title
    from apps.library.services.holds import cancel_for_title

    title = LibraryTitle.objects.get(pk=title_id)
    if title.copies_total == 0:
        cancel_for_title(ctx, title.pk, "No copies left")
        if title.status == TitleStatus.ACTIVE:
            archive_title(ctx=ctx, title_id=title.pk, auto=True)


# ── loss per 1,000 issued (BR-4) ────────────────────────────────────────────


def loss_per_thousand(v: LibraryVerification) -> dict:
    """(marked missing by this check + lost in the 12 months to `closed_on` and not found
    since) ÷ loans issued in those months × 1,000, to one decimal; None when none issued."""
    end = v.closed_on or tenant_today(v.tenant)
    start_on = end - dt.timedelta(days=365)
    marked = (
        LibraryCopyEvent.objects.filter(
            tenant_id=v.tenant_id,
            source_type=SOURCE_VERIFICATION,
            source_id=v.id,
            reason_code=CopyEventReason.MISSING,
        )
        .values("copy_id")
        .distinct()
        .count()
    )
    lost = (
        LibraryCopyEvent.objects.filter(
            tenant_id=v.tenant_id,
            reason_code=CopyEventReason.LOST,
            on_date__gt=start_on,
            on_date__lte=end,
            copy__status=CopyStatus.LOST,
        )
        .values("copy_id")
        .distinct()
        .count()
    )
    issued = LibraryLoan.objects.filter(
        tenant_id=v.tenant_id, issued_on__gt=start_on, issued_on__lte=end
    ).count()
    per = (Decimal(marked + lost) * 1000 / issued).quantize(Decimal("0.1")) if issued else None
    return {
        "marked_missing": marked,
        "lost_in_year": lost,
        "issued_in_year": issued,
        "per_thousand": str(per) if per is not None else None,
        "norm": str(LOSS_NORM_PER_THOUSAND),
    }


def verification_json(v: LibraryVerification) -> dict:
    return {
        "id": str(v.id),
        "name": v.name,
        "scope_kind": v.scope_kind,
        "location_ids": [str(pk) for pk in v.location_ids],
        "category_ids": [str(pk) for pk in v.category_ids],
        "range_from": v.range_from,
        "range_to": v.range_to,
        "started_on": v.started_on.isoformat(),
        "closed_on": v.closed_on.isoformat() if v.closed_on else None,
        "status": v.status,
        "reopened": v.reopened,
        "counts": {
            "expected": v.expected_count,
            "found": v.found_count,
            "wrong_location": v.wrong_location_count,
            "on_loan": v.on_loan_count,
            "missing": v.missing_count,
            "unknown": v.unknown_count,
            "flagged": v.flagged_count,
            "outside_scope": v.outside_scope_count,
            "missing_value": f"{v.missing_value:.2f}",
        },
        "version": v.version,
    }
