"""B02 — the library's error codes, audit actions and stored vocabularies.

Appendix A and Appendix B of the library FRD, and the CHECK lists of its §5
tables, are registered before any library table or view exists, so every later
task names a code, an action or a value instead of inventing one at the call
site.
"""

from __future__ import annotations

from apps.common.audit import AuditAction
from apps.common.error_codes import REGISTRY
from apps.library import constants as c

# Appendix A, copied as the assertion target: code -> HTTP status.
APPENDIX_A = {
    "library_accession_taken": 409,
    "library_accession_frozen": 409,
    "library_code_ambiguous": 409,
    "library_copy_on_loan": 409,
    "library_copy_unavailable": 409,
    "library_title_has_copies": 409,
    "library_category_in_use": 409,
    "library_location_in_use": 409,
    "library_membership_exists": 409,
    "library_member_number_taken": 409,
    "library_membership_closed": 409,
    "library_membership_has_loans": 409,
    "library_membership_inactive": 409,
    "library_member_blocked": 409,
    "library_copy_not_loanable": 409,
    "library_copy_not_on_loan": 409,
    "library_renewal_refused": 409,
    "library_cancel_window_passed": 409,
    "library_calendar_all_closed": 409,
    "library_loan_not_open": 409,
    "library_charge_not_open": 409,
    "library_charge_has_payments": 409,
    "library_waiver_over_ceiling": 403,
    "library_hold_refused": 409,
    "library_hold_not_open": 409,
    "library_nothing_overdue": 409,
    "library_verification_closed": 409,
    "library_verification_open": 409,
    "library_verification_reopen_used": 409,
    "library_print_too_large": 409,
}

# Appendix B, expanded from its `a|b|c` shorthand.
APPENDIX_B = {
    "library.settings.updated",
    *(f"library.title.{v}" for v in ("created", "updated", "archived", "restored")),
    *(
        f"library.copy.{v}"
        for v in (
            "created",
            "updated",
            "withdrawn",
            "repaired",
            "back_to_shelf",
            "found",
            "marked_missing",
        )
    ),
    *(f"library.category.{v}" for v in ("created", "updated", "merged", "deleted")),
    *(f"library.location.{v}" for v in ("created", "updated", "deleted")),
    *(f"library.membership_type.{v}" for v in ("created", "updated")),
    "library.loan_rules.updated",
    *(
        f"library.membership.{v}"
        for v in (
            "enrolled",
            "updated",
            "renewed",
            "type_changed",
            "suspended",
            "reactivated",
            "closed",
            "rejoined",
        )
    ),
    *(
        f"library.loan.{v}"
        for v in (
            "issued",
            "returned",
            "renewed",
            "cancelled",
            "due_changed",
            "lost",
            "replaced",
            "overridden",
            "imported",
        )
    ),
    *(f"library.charge.{v}" for v in ("created", "waived", "reversed", "status_changed")),
    *(
        f"library.hold.{v}"
        for v in (
            "placed",
            "ready",
            "set_aside",
            "collected",
            "expired",
            "cancelled",
            "extended",
            "moved",
        )
    ),
    *(
        f"library.verification.{v}"
        for v in ("started", "closed", "reopened", "missing_marked", "missing_withdrawn")
    ),
    "library.card.printed",
    "library.no_dues.issued",
}

#: `platform_audit_log.action` is `varchar(64)` (`platform_app/models/audit.py`).
AUDIT_ACTION_MAX = 64


def _library_actions() -> dict[str, str]:
    return {
        name: value
        for name, value in vars(AuditAction).items()
        if name.startswith("LIBRARY_") and isinstance(value, str)
    }


def test_every_appendix_a_code_is_registered_with_its_status() -> None:
    """A library refusal raised with an unregistered code is a 500 with no
    envelope, and a client switching on `code` cannot tell it apart from a
    crash. Every code is a state the member must change, so none is retryable."""
    library = {code: rule for code, rule in REGISTRY.items() if code.startswith("library_")}
    assert set(library) == set(APPENDIX_A)
    for code, status in APPENDIX_A.items():
        assert library[code] == (status, False), code


def test_the_waiver_ceiling_is_a_403_not_a_409() -> None:
    """LIB-07 §8: the waive dialog shows this refusal inline, with who can do
    it, rather than as a conflict in the snackbar. A 409 here would route it to
    the generic conflict handling and lose the 'ask the owner' copy."""
    assert REGISTRY["library_waiver_over_ceiling"] == (403, False)


def test_audit_actions_are_exactly_appendix_b() -> None:
    """FR-6: every library write is audited with `library.<entity>.<verb>`.
    An action string typed at a call site (`library.copy.retired`) splits one
    event across two names in the audit log's filter."""
    assert set(_library_actions().values()) == APPENDIX_B


def test_every_library_audit_action_fits_the_column_and_is_named_for_its_value() -> None:
    """A value longer than the column is truncated or refused at insert —
    inside the service's transaction, so the write itself fails. The constant's
    name is its value upper-cased, so a grep for either finds both."""
    for name, value in _library_actions().items():
        assert value.startswith("library."), name
        assert len(value) <= AUDIT_ACTION_MAX, name
        assert name == value.upper().replace(".", "_"), name


def test_core_actions_the_library_writes_are_reused_not_duplicated() -> None:
    """Appendix B's core actions (deposits, payments, counters, reminders) are
    the core's own constants. A `LIBRARY_DEPOSIT_REFUNDED` would put a library
    refund under a different name from every other deposit refund."""
    assert AuditAction.DEPOSIT_REFUNDED == "deposit.refunded"
    assert AuditAction.PAYMENT_RECORDED == "payment.recorded"
    assert AuditAction.COUNTER_RAISED == "counter.raised"
    values = set(_library_actions().values())
    assert not {v for v in values if v.split(".")[1] in {"deposit", "payment", "counter"}}


# FRD §5 CHECK lists, copied as the assertion target.
VOCABULARIES = {
    c.MaterialType: ["book", "reference", "magazine", "textbook", "audio_visual", "other"],
    c.CopyStatus: [
        "available",
        "on_loan",
        "on_hold_shelf",
        "in_repair",
        "lost",
        "missing",
        "withdrawn",
    ],
    c.CopySource: ["bought", "gifted", "transferred", "other"],
    c.CopyCondition: ["good", "fair", "poor"],
    c.WithdrawReason: ["worn_out", "lost", "missing", "transferred", "damaged", "other"],
    c.CopyEventReason: [
        "created",
        "issued",
        "returned",
        "set_aside",
        "withdrawn",
        "repair",
        "back_to_shelf",
        "lost",
        "found",
        "missing",
        "cancelled_issue",
        "imported",
        "edited_number",
    ],
    c.ChargeKind: [
        "admission_fee",
        "membership_fee",
        "renewal_fee",
        "overdue_fine",
        "lost_book",
        "damage",
        "processing",
        "other",
    ],
    c.ChargeStatus: ["open", "part_paid", "paid", "waived", "refunded", "reversed"],
    c.WaiverKind: ["waiver", "found", "replaced", "found_refund"],
    c.MembershipStatus: ["active", "suspended", "closed"],
    c.PeriodKind: [
        "enrol",
        "renew",
        "rejoin",
        "type_change",
        "suspend",
        "reactivate",
        "close",
    ],
    c.FineRounding: ["rupee", "paise"],
    c.OverdueIssueRule: ["block", "warn", "off"],
    c.RenewFrom: ["today", "due_date"],
    c.RenewOverdue: ["charge_fine", "block"],
    c.LostFoundPaid: ["refund", "keep"],
}

# FRD §5 column widths for the vocabularies whose column is narrowest.
WIDTHS = {
    c.MaterialType: 16,
    c.CopyStatus: 16,
    c.CopySource: 12,
    c.CopyCondition: 8,
    c.WithdrawReason: 16,
    c.CopyEventReason: 24,
    c.ChargeKind: 16,
    c.ChargeStatus: 10,
    c.WaiverKind: 12,
    c.MembershipStatus: 10,
    c.FineRounding: 8,
    c.OverdueIssueRule: 8,
    c.RenewFrom: 10,
    c.RenewOverdue: 12,
    c.LostFoundPaid: 8,
}


def test_each_vocabulary_is_exactly_its_frd_check_list() -> None:
    """B05, B06, B07 and B10 each build a CHECK from these. A value missing
    here is a state the code cannot write; an extra one is a CHECK the
    database refuses at the first write that uses it."""
    for choices, expected in VOCABULARIES.items():
        assert list(choices.values) == expected, choices.__name__


def test_every_value_fits_its_frd_column() -> None:
    """A value wider than its `varchar` is a DataError at insert, found only
    by the first record that reaches that state."""
    for choices, width in WIDTHS.items():
        for value in choices.values:
            assert len(value) <= width, (choices.__name__, value)
