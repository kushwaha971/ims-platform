"""Share links and the UPI intent (SAL-03 FR-4, FR-5, BR-2..BR-4).

── Where the token lives, and why ───────────────────────────────────────────
`sales_document.public_token_hash` is the column Part 21 §21.3.7 names, with
its unique index; the expiry rides in `meta.share_link` beside it. Part 43
C1 (decided 23 Sep 2026) makes `parties_share_link` the generalised share
table for every entity — but that table does not exist, belongs to `parties`,
and its first migration is Gate 1 for a feature of its own. One active token
per document (BR-4) is exactly what one column holds, so this wave uses it and
the move into the generalised table is a data migration over one column
(recorded in docs/CR-LOG.md), not a redesign.

Token: 32 bytes, base64url in the URL, only SHA-256 stored; compared by
hash lookup, 404 for unknown and expired alike (no enumeration, §19).

── One live link per document, and sharing twice is the SAME link (UAT D1) ──
Every "Copy link" / "Share on WhatsApp" used to mint a fresh token and so
silently kill the one the customer already had on WhatsApp. Sharing is now
idempotent: while a link is live (hash set, not expired, not revoked) the
same URL comes back. To show a URL again without storing it, the token is
DERIVED rather than drawn: `HMAC-SHA256(SECRET_KEY, "sales-share:<doc>:<nonce>")`
with a random 16-byte nonce kept in `meta.share_link.nonce`. A database dump
alone still yields no usable link (the nonce is useless without the server
key, and the column still holds only the SHA-256), which is the property
H1's hashing was bought for. Rotation is explicit: revoke (owner/admin),
then share again — a new nonce, a new token, the old one 404s.
A legacy link minted before this (no nonce), or one whose derivation no
longer matches its hash (SECRET_KEY rotated), cannot be shown again and is
replaced by a fresh link, which is the old behaviour. CR-2026-09-29-UAT-D1.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import secrets
from base64 import urlsafe_b64encode
from decimal import Decimal
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import constant_time_compare, salted_hmac

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, NotFound, ValidationFailed
from apps.common.qr import encode, matrix_rows
from apps.common.upi import build_upi_url, valid_vpa
from apps.sales.constants import SHARE_DAYS_DEFAULT, SHARE_DAYS_MAX, DocumentStatus
from apps.sales.models import SalesDocument
from apps.sales.services import settings as sales_settings


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def _derive(document_id: Any, nonce: str) -> str:
    """The URL token for (document, nonce) — recoverable only with the server key."""
    digest = salted_hmac(
        "apps.sales.share", f"sales-share:{document_id}:{nonce}", algorithm="sha256"
    ).digest()
    return urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def _live_token(document: SalesDocument) -> tuple[str, str] | None:
    """(token, expires_at) of the document's live link, when it can be shown again."""
    if not document.public_token_hash:
        return None
    link = (document.meta or {}).get("share_link") or {}
    nonce, raw = link.get("nonce"), link.get("expires_at")
    if not nonce or not raw or link.get("revoked_at"):
        return None
    try:
        expires_at = dt.datetime.fromisoformat(raw)
    except ValueError:
        return None
    if expires_at <= timezone.now():
        return None
    token = _derive(document.id, nonce)
    if not constant_time_compare(_hash(token), document.public_token_hash):
        return None
    return token, raw


def _url(token: str) -> str:
    base = str(getattr(settings, "UB_PUBLIC_BASE_URL", "")).rstrip("/")
    return f"{base}/d/{token}"


@transaction.atomic
def create_share_link(
    *, ctx: Ctx, document_id: Any, expires_in_days: Any = None, channel: str | None = None
) -> dict:
    days = SHARE_DAYS_DEFAULT if expires_in_days in (None, "") else expires_in_days
    try:
        days = int(days)
    except (TypeError, ValueError):
        days = 0
    if not 1 <= days <= SHARE_DAYS_MAX:
        raise ValidationFailed({"expires_in_days": ["Expiry must be 1–90 days"]})
    document = (
        SalesDocument.objects.select_for_update().filter(tenant=ctx.tenant, pk=document_id).first()
    )
    if document is None:
        raise NotFound("No such invoice.")
    if document.status == DocumentStatus.DRAFT:
        raise BusinessRuleViolation(
            "document_not_shareable", "Issue the invoice before sharing it.", details={}
        )
    live = _live_token(document)
    if live is not None:
        # UAT D1 — sharing again hands back the link the customer already has.
        return {"url": _url(live[0]), "expires_at": live[1], "reused": True}
    regenerated = bool(document.public_token_hash)
    nonce = secrets.token_urlsafe(16)
    token = _derive(document.id, nonce)
    expires_at = timezone.now() + dt.timedelta(days=days)
    document.public_token_hash = _hash(token)
    document.meta = {
        **(document.meta or {}),
        "share_link": {
            "expires_at": expires_at.isoformat(),
            "channel": channel or "link",
            "nonce": nonce,
        },
    }
    document.save(update_fields=["public_token_hash", "meta", "updated_at"])
    write_audit(
        ctx=ctx,
        action=(
            AuditAction.INVOICE_SHARE_LINK_REGENERATED
            if regenerated
            else AuditAction.INVOICE_SHARE_LINK_CREATED
        ),
        entity_type="sales_document",
        entity_id=document.id,
        metadata={"expires_at": expires_at.isoformat(), "channel": channel or "link"},
    )
    return {"url": _url(token), "expires_at": expires_at.isoformat(), "reused": False}


@transaction.atomic
def revoke_share_link(*, ctx: Ctx, document_id: Any) -> dict:
    """Kill the document's link at once (Part 27 §27.12 "Revocation", SAL-03 BR-4).

    Until this existed the only way to stop a link was to mint a NEW one — which
    hands the merchant a second live link to a document they wanted to stop
    sharing. The hash is cleared, so the old token now misses the unique index
    exactly like a token that never existed (same 404, no oracle), and the
    revocation is kept in `meta.share_link` for the activity log. Idempotent: a
    document with no live link answers `revoked: false` rather than an error,
    because "make sure nobody can open this" is satisfied either way.
    """
    document = (
        SalesDocument.objects.select_for_update().filter(tenant=ctx.tenant, pk=document_id).first()
    )
    if document is None:
        raise NotFound("No such document.")
    if not document.public_token_hash:
        return {"revoked": False}
    now = timezone.now()
    link = dict((document.meta or {}).get("share_link") or {})
    link.pop("nonce", None)  # the revoked link can never be derived (or shown) again
    document.public_token_hash = None
    document.meta = {**(document.meta or {}), "share_link": {**link, "revoked_at": now.isoformat()}}
    document.save(update_fields=["public_token_hash", "meta", "updated_at"])
    write_audit(
        ctx=ctx,
        action=AuditAction.INVOICE_SHARE_LINK_REVOKED,
        entity_type="sales_document",
        entity_id=document.id,
        metadata={"number": document.number, "expires_at": link.get("expires_at")},
    )
    return {"revoked": True}


def public_document(token: str) -> SalesDocument:
    """`GET /public/d/{token}` — the document, or 404 for unknown and expired alike."""
    if not token or len(token) > 128:
        raise NotFound("This link has expired.")
    document = (
        SalesDocument.objects.select_related("tenant", "party")
        .prefetch_related("lines")
        .filter(public_token_hash=_hash(token))
        .first()
    )
    if document is None:
        raise NotFound("This link has expired.")
    raw = ((document.meta or {}).get("share_link") or {}).get("expires_at")
    try:
        expires_at = dt.datetime.fromisoformat(raw) if raw else None
    except ValueError:
        expires_at = None
    if expires_at is None or expires_at < timezone.now():
        raise NotFound("This link has expired.")
    return document


#: The kinds a customer can pay FROM. An estimate is a quotation (nothing is
#: owed yet) and a credit note is money the shop owes the customer.
PAYABLE_KINDS: frozenset[str] = frozenset({"invoice", "bill_of_supply"})

#: Statuses with money still owed on them (canon §0.7).
PAYABLE_STATUSES: frozenset[str] = frozenset({"issued", "partially_paid", "overdue"})


def public_pay_intent(document: SalesDocument) -> dict | None:
    """The customer page's "Pay ₹X" — the paper's dynamic QR, or nothing (SAL-03 FR-4/FR-5).

    Only when money is actually owed on a payable kind: a paid bill has
    nothing to pay (the paper's STATIC QR is a merchant convenience a
    customer page has no use for), a void one must never invite a payment
    (EC-6), and an estimate or a credit note is not a bill. Nothing when the
    shop has not set a valid UPI ID or has turned the QR off, rather than an
    error — the page simply shows no pay block (SAL-14 EC-5).
    """
    if document.kind not in PAYABLE_KINDS or document.status not in PAYABLE_STATUSES:
        return None
    if document.amount_due is None or document.amount_due <= Decimal("0"):
        return None
    try:
        intent = upi_intent(document)
    except BusinessRuleViolation:
        return None
    return intent if intent.get("amount") else None


def public_logo(document: SalesDocument) -> Any:
    """The shop's own logo attachment for the customer page, or `None`.

    Resolved through WLB-01's branding (so a partner-locked key behaves as it
    does on the merchant's print), then matched INSIDE the document's tenant:
    a partner's default logo belongs to no tenant and is not streamed here.
    """
    from apps.files.selectors.attachments import attachment_of_tenant
    from apps.platform_app.branding import resolve

    attachment_id = resolve(document.tenant).get("logo_attachment_id")
    if not attachment_id:
        return None
    return attachment_of_tenant(tenant=document.tenant, attachment_id=attachment_id)


def upi_intent(document: SalesDocument) -> dict:
    """FR-4 — dynamic with the amount due, static (no `am`) when nothing is due."""
    tenant = document.tenant
    if not sales_settings.show_upi_qr(tenant) or not valid_vpa(tenant.upi_vpa):
        raise BusinessRuleViolation(
            "upi_not_configured",
            "Add your UPI ID in Business profile to print a QR.",
            details={},
        )
    due = document.amount_due if document.status != DocumentStatus.DRAFT else document.grand_total
    amount = due if due > Decimal("0") and document.status != DocumentStatus.VOID else None
    url = build_upi_url(
        pa=str(tenant.upi_vpa),
        pn=tenant.legal_name or tenant.name,
        am=amount,
        tn=document.number or None,
        tr=document.id.hex[:12],
    )
    matrix = encode(url)
    return {
        "upi_url": url,
        "amount": str(amount) if amount is not None else None,
        "qr": {"size": len(matrix), "modules": matrix_rows(matrix)},
    }
