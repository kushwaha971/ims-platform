"""The closed error-code registry (Part 22 §22.1.1, table T-16).

Every error the API may return carries a code from this set, and no code outside
it may be emitted. Part 28 §28.3.6 asserts the emitted set equals this set. The
registry is data here, not a second copy of the prose: each entry is
`(code, http_status, retryable)`.
"""

from __future__ import annotations

from types import MappingProxyType

# code -> (http status, retryable)
_REGISTRY: dict[str, tuple[int, bool]] = {
    # A — cross-cutting
    "validation_error": (400, False),
    "not_found": (404, False),
    "permission_denied": (403, False),
    "module_disabled": (403, False),
    "plan_limit_reached": (403, False),
    "idempotency_conflict": (409, False),
    "idempotency_in_progress": (409, True),
    "stale_version": (409, False),
    "precondition_failed": (412, False),
    "too_many_rows": (400, False),
    "too_many_ids": (400, False),
    "file_too_large": (400, False),
    "image_too_large": (400, False),
    "unsupported_file_type": (400, False),
    "service_busy": (503, True),
    "rate_limited": (429, True),
    "server_error": (500, True),
    # B — authentication, session, tenant context
    "invalid_credentials": (401, False),
    "otp_invalid": (400, False),
    "otp_throttled": (429, True),
    "login_throttled": (429, True),
    "invalid_token": (401, False),
    "token_stale": (401, True),
    "session_revoked": (401, False),
    "current_session": (409, False),
    "no_active_tenant": (403, False),
    # The account is on a temporary password issued by an owner. Every
    # authenticated route except the change itself answers this until the
    # person picks their own password -- see `common/authentication.py`.
    "password_change_required": (403, False),
    "password_expired": (401, False),
    "invitation_invalid": (400, False),
    "memberships_exist": (409, False),
    "export_required": (409, False),
    "impersonation_not_consented": (403, False),
    "impersonation_forbidden": (403, False),
    # C — platform, governance, white-label
    "last_owner": (409, False),
    "self_change_forbidden": (403, False),
    "tenant_suspended": (403, False),
    "partner_suspended": (403, False),
    "tenant_pending_deletion": (409, False),
    "plan_in_use": (409, False),
    "module_has_data": (409, False),
    "gst_type_locked": (409, False),
    "gstin_in_use": (409, False),
    "sequence_backwards": (409, False),
    "branding_locked": (403, False),
    "low_contrast": (400, False),
    "theme_invalid": (400, False),
    "template_mismatch": (409, False),
    "font_missing_devanagari": (400, False),
    "hostname_in_use": (409, False),
    "wrong_partner_host": (403, False),
    "partner_ceiling_exceeded": (403, False),
    "share_link_limit": (409, False),
    "link_expired": (404, False),
    "link_revoked": (404, False),
    # D — parties and ledger
    "party_archived": (409, False),
    "party_already_archived": (409, False),
    "party_not_archived": (409, False),
    "party_balance_nonzero": (409, False),
    # PTY-04 FR-3's write-off escape — beyond §22.1.1, carried in `CR-LOG`
    # (CR-2026-09-23-A). `nothing_to_write_off` is a client bug made visible (a
    # write-off sent for a party who owes nothing); `balance_changed` is the
    # locked balance disagreeing with the amount the merchant confirmed.
    "nothing_to_write_off": (400, False),
    "balance_changed": (409, False),
    "party_deleted": (409, False),
    "credit_limit_exceeded": (409, False),
    "override_not_allowed": (403, False),
    "opening_balance_exists": (409, False),
    "entry_already_reversed": (409, False),
    "use_document_void": (409, False),
    "merge_self": (409, False),
    "merge_in_progress": (409, False),
    "merge_balance_mismatch": (409, False),
    "merge_too_large": (409, False),
    "tag_name_taken": (409, False),
    "tag_limit_reached": (400, False),
    "collection_requires_receivable": (409, False),
    "nothing_due": (409, False),
    # E — inventory
    "insufficient_stock": (409, False),
    "stock_nonzero": (409, False),
    "item_archived": (409, False),
    "item_has_movements": (409, False),
    "item_type_locked": (409, False),
    "track_stock_not_allowed": (400, False),
    "opening_stock_required": (409, False),
    "opening_exists": (409, False),
    "duplicate_sku": (400, False),
    "barcode_exists": (409, False),
    "sku_generation_failed": (409, False),
    "unit_in_use": (409, False),
    "unit_locked": (409, False),
    "category_in_use": (409, False),
    "last_category": (409, False),
    "system_category_immutable": (409, False),
    "nesting_too_deep": (400, False),
    "tax_rate_inactive": (400, False),
    "tax_rate_not_effective": (400, False),
    "missing_weight": (400, False),
    "same_location": (400, False),
    # F — sales and purchases documents
    "kind_not_allowed": (400, False),
    "document_not_draft": (409, False),
    "document_not_open": (409, False),
    "document_not_recorded": (409, False),
    "document_not_editable": (409, False),
    "document_already_void": (409, False),
    "document_not_shareable": (409, False),
    "has_dependent_documents": (409, False),
    "duplicate_supplier_invoice": (409, False),
    "duplicate_code": (400, False),
    "line_closed": (409, False),
    "over_receipt": (409, False),
    "qty_below_received": (400, False),
    "items_changed_since": (409, False),
    "nothing_to_return": (409, False),
    "refund_exists": (409, False),
    "gst_not_registered": (409, False),
    # G — payments and expenses
    "over_allocated": (409, False),
    "mode_sum_mismatch": (400, False),
    "split_amount_mismatch": (400, False),
    "payment_already_void": (409, False),
    "payment_not_unmatched": (409, False),
    "payment_already_matched": (409, False),
    "payment_request_linked": (409, False),
    "upi_vpa_missing": (409, False),
    "expense_already_void": (409, False),
    "expense_amount_immutable": (409, False),
    # H — notifications and messaging
    "channel_not_configured": (409, False),
    "provider_not_configured": (403, False),
    "provider_credentials_invalid": (400, False),
    "provider_error": (502, True),
    "signature_invalid": (400, False),
    "dlt_template_required": (409, False),
    "template_not_registered": (409, False),
    "template_not_approved": (409, False),
    "party_opted_out": (409, False),
    "push_not_subscribed": (409, False),
    "invalid_push_endpoint": (400, False),
    "push_subscription_expired": (409, False),
    "email_quota_exceeded": (429, True),
    # I — import, export and reports
    "import_not_ready": (409, False),
    "import_has_errors": (409, False),
    "import_in_progress": (409, False),
    "missing_columns": (400, False),
    "unknown_column": (400, False),
    "duplicate_in_file": (400, False),
    "legacy_excel_format": (400, False),
    "upsert_not_supported": (400, False),
    "revert_window_closed": (409, False),
    "export_in_progress": (409, False),
    "export_too_large": (400, False),
    "export_expired": (404, False),
    "export_queue_full": (503, True),
    "nothing_to_export": (400, False),
    "period_not_closed": (409, False),
    "gstr1_blocked": (409, False),
    "gstr1_warnings_unacknowledged": (409, False),
    "schema_validation_failed": (400, False),
    "confirmation_required": (409, False),
}

# `unauthenticated` is emitted by the exception handler for DRF's
# NotAuthenticated / AuthenticationFailed and is named in Part 26 §26.8 R8.2.
_REGISTRY["unauthenticated"] = (401, False)

REGISTRY: MappingProxyType = MappingProxyType(_REGISTRY)

ERROR_CODES: frozenset[str] = frozenset(_REGISTRY)

RETRYABLE_CODES: frozenset[str] = frozenset(
    code for code, (_status, retryable) in _REGISTRY.items() if retryable
)


def http_status_for(code: str) -> int:
    """The registered HTTP status for a code. Unknown codes are a defect."""
    try:
        return _REGISTRY[code][0]
    except KeyError as exc:  # pragma: no cover - defensive
        raise KeyError(f"Unregistered error code {code!r} (Part 22 §22.1.1)") from exc
