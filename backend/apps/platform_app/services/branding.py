"""WLB-01 / PLT-07 FR-2 — writing a tenant's branding (`PUT /tenants/current/branding`).

One multipart request carries up to two files and five text fields, and all of
it lands in one transaction with one audit row per concern: `branding.updated`
for the brand (colour, names, header/footer, logo) and
`branding.signature_updated` for PLT-07's signature, because "who changed the
signature on our bills" is a different question from "who changed the colour".

Order of refusals, each before any byte is written:

1. a locked key (WLB-02 BR-2) → 403 `branding_locked` — even when the value
   sent equals the partner's, because the field is not the tenant's to send;
2. a malformed field → 400 `validation_error`;
3. a colour under 3:1 → 400 `low_contrast` with `details.suggested_hex`;
4. a bad image → the files app's codes (`unsupported_file_type`,
   `file_too_large`, `validation_error` for a too-small image).
"""

from __future__ import annotations

from typing import Any

from django.db import transaction
from django.utils.translation import gettext_lazy as _

from apps.common.audit import AuditAction, diff_fields, write_audit
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.platform_app import branding as rules

TEXT_KEYS: tuple[str, ...] = (
    "primary_hex",
    "secondary_hex",
    "app_name",
    "doc_header",
    "doc_footer",
)
RESETTABLE_KEYS: tuple[str, ...] = (*TEXT_KEYS, "logo")


def _locked(tenant: Any) -> set[str]:
    return set(rules.locked_keys(tenant.partner))


def update_branding(
    *,
    tenant: Any,
    ctx: Ctx,
    fields: dict[str, Any],
    logo: Any = None,
    signature: Any = None,
    remove_logo: bool = False,
    remove_signature: bool = False,
    reset: list[str] | None = None,
) -> dict:
    """Apply one PUT. `fields` holds only the text keys the request carried.

    An empty string for a text key is the same gesture as `reset` for it: the
    tenant value is cleared and the key resolves to the partner or product
    default again (FR-9).
    """
    from apps.files.constants import OWNER_TENANT, AttachmentKind
    from apps.files.services.images import retire, store_branding_image

    reset = list(reset or [])
    unknown_reset = sorted(set(reset) - set(RESETTABLE_KEYS))
    if unknown_reset:
        raise ValidationFailed({"reset": [f"'{unknown_reset[0]}' cannot be reset."]})

    locks = _locked(tenant)
    touched = set(fields) | set(reset)
    if logo is not None or remove_logo:
        touched.add("logo")
    refused = sorted(k for k in touched if rules.LOCK_NAME_OF_KEY.get(k, k) in locks)
    if refused:
        raise BusinessRuleViolation(
            "branding_locked",
            str(
                _("This is set by %(partner)s and cannot be changed.")
                % {"partner": tenant.partner.name}
            ),
            details={"keys": refused},
        )

    errors = rules.validate_text_fields(fields)
    if errors:
        raise ValidationFailed(errors)

    cleaned: dict[str, Any] = {}
    for key, value in fields.items():
        text = (value or "").strip() if isinstance(value, str) else value
        if key in ("primary_hex", "secondary_hex") and text:
            text = rules.normalise_hex(text)
        cleaned[key] = text or None

    primary = cleaned.get("primary_hex")
    if primary:
        ratio = rules.contrast_ratio(primary, rules.WHITE)
        if ratio < rules.MIN_PRIMARY_CONTRAST:
            raise BusinessRuleViolation(
                "low_contrast",
                str(
                    _("Too light for buttons. Try %(hex)s") % {"hex": rules.suggest_darker(primary)}
                ),
                details={
                    "primary_hex": [f"Too light for buttons ({ratio:.2f}:1)."],
                    "ratio": round(ratio, 2),
                    "minimum": rules.MIN_PRIMARY_CONTRAST,
                    "suggested_hex": rules.suggest_darker(primary),
                },
            )

    for key in reset:
        if key == "logo":
            remove_logo = True
        else:
            cleaned[key] = None

    before = dict(tenant.branding or {})
    after = dict(before)
    for key, value in cleaned.items():
        if value is None:
            after.pop(key, None)
        else:
            after[key] = value

    with transaction.atomic():
        if logo is not None:
            stored = store_branding_image(
                tenant=tenant,
                kind=AttachmentKind.LOGO.value,
                upload=logo,
                owner_type=OWNER_TENANT,
                owner_id=tenant.id,
                actor=ctx.actor,
            )
            retire(attachment_id=before.get("logo_attachment_id"), tenant=tenant)
            after["logo_attachment_id"] = str(stored.id)
        elif remove_logo and before.get("logo_attachment_id"):
            retire(attachment_id=before.get("logo_attachment_id"), tenant=tenant)
            after.pop("logo_attachment_id", None)

        if signature is not None:
            stored = store_branding_image(
                tenant=tenant,
                kind=AttachmentKind.SIGNATURE.value,
                upload=signature,
                owner_type=OWNER_TENANT,
                owner_id=tenant.id,
                actor=ctx.actor,
            )
            retire(attachment_id=before.get("signature_attachment_id"), tenant=tenant)
            after["signature_attachment_id"] = str(stored.id)
        elif remove_signature and before.get("signature_attachment_id"):
            retire(attachment_id=before.get("signature_attachment_id"), tenant=tenant)
            after.pop("signature_attachment_id", None)

        if after != before:
            tenant.branding = after
            tenant.save(update_fields=["branding", "updated_at"])

        brand_keys = [*TEXT_KEYS, "logo_attachment_id"]
        b_before, b_after = diff_fields(before, after, fields=brand_keys)
        if b_before or b_after:
            write_audit(
                ctx=ctx,
                action=AuditAction.BRANDING_UPDATED,
                entity_type="platform_tenant",
                entity_id=tenant.id,
                before=b_before,
                after=b_after,
            )
        s_before, s_after = diff_fields(before, after, fields=["signature_attachment_id"])
        if s_before or s_after:
            write_audit(
                ctx=ctx,
                action=AuditAction.BRANDING_SIGNATURE_UPDATED,
                entity_type="platform_tenant",
                entity_id=tenant.id,
                before=s_before,
                after=s_after,
            )
    return rules.resolve(tenant)
