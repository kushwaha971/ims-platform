"""A14 (ADR-056, R72) — `payments` is core and imports neither `sales` nor `purchases`.

Before A14 the two document targets, the purchase void-listener wiring and SAL-04's refund
release lived inside `payments`, so the one core app every vertical depends on imported the Shop
& billing apps at module level. The owners now register what they own from their own `ready()`.
These tests fail on the old layout and pin the new one; the unchanged payments, sales and
purchases suites are the proof that nothing a merchant sees moved.
"""

from __future__ import annotations

import ast
import pathlib
from typing import Any

import pytest

PAYMENTS_ROOT = pathlib.Path(__file__).resolve().parents[1]


def _every_import(path: pathlib.Path) -> set[str]:
    """Every module a file imports, at ANY depth — a deferred import is still an import."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            found.add(node.module)
    return found


def test_payments_imports_neither_document_app_even_deferred() -> None:
    """The defect: core `payments` importing the sales and purchases apps (ADR-041's
    grandfathered exception) made "core never imports a vertical" untestable for the app every
    module depends on. Walks every node, so a deferred import inside `ready()` fails too."""
    offenders: list[str] = []
    for path in PAYMENTS_ROOT.rglob("*.py"):
        if "tests" in path.parts or "migrations" in path.parts:
            continue
        for module in _every_import(path):
            if module.startswith(("apps.sales", "apps.purchases")):
                offenders.append(f"{path.relative_to(PAYMENTS_ROOT)} → {module}")
    assert offenders == []


def test_the_owners_register_their_document_targets_in_the_old_order() -> None:
    """The targets are the owners' code now, and registration order — which `"auto"` and the
    allocation picker walk — is unchanged: the sales invoice first, the purchase bill second."""
    from apps.payments.services.targets import target_for, targets_for_direction

    sales_target = target_for("sales_document")
    purchase_target = target_for("purchase_document")
    assert type(sales_target).__module__ == "apps.sales.services.payment_target"
    assert type(purchase_target).__module__ == "apps.purchases.services.payment_target"
    # ── A4b ── payments' deposit targets register after both, in their own bucket.
    main = {"bucket": "main"}
    assert [t.document_type for t in targets_for_direction("in", **main)] == ["sales_document"]
    assert [t.document_type for t in targets_for_direction("out", **main)] == ["purchase_document"]


def test_purchases_wires_the_bill_void_listener_itself() -> None:
    """PUR-02 BR-4 — voiding a bill still leaves its supplier payments as advances; the
    listener is registered by purchases, which owns the seam it plugs into."""
    from apps.payments.services.void import release_purchase_bill
    from apps.purchases.services import payment_seam

    assert release_purchase_bill in payment_seam._VOID_LISTENERS


def test_sales_registers_the_refund_release_on_the_payment_void_seam() -> None:
    """SAL-04 FR-10 — voiding a credit note's refund voucher gives the money back to the note.
    That call used to be a module-level import of sales inside `void.py`."""
    from apps.payments.services.void_seam import payment_void_listeners

    keys = [key for key, _listener in payment_void_listeners()]
    assert "sales.credit_note_refund" in keys


def test_the_payment_source_resolver_is_still_registered() -> None:
    """LED-10 FR-5 — the khata still names a receipt by its number (payments' own resolver)."""
    from apps.ledger.constants import SourceType
    from apps.ledger.selectors import sources

    assert SourceType.PAYMENT in sources._RESOLVERS


def test_the_void_seam_is_keyed_idempotent_and_resettable() -> None:
    """ADR-042 registry rules: a second `ready()` is harmless, a different listener under a used
    key is a start-up error rather than a silent replacement, and `_reset_for_tests` restores the
    start-up snapshot so one test's fake cannot leak into the next."""
    from django.core.exceptions import ImproperlyConfigured

    from apps.payments.services import void_seam

    def listener(*, ctx: Any, payment: Any) -> list[dict]:
        return []

    def other(*, ctx: Any, payment: Any) -> list[dict]:
        return []

    void_seam._reset_for_tests()
    before = list(void_seam.payment_void_listeners())
    try:
        void_seam.register_payment_void_listener("test.fake", listener)
        void_seam.register_payment_void_listener("test.fake", listener)
        assert [k for k, _ in void_seam.payment_void_listeners()].count("test.fake") == 1
        with pytest.raises(ImproperlyConfigured):
            void_seam.register_payment_void_listener("test.fake", other)
    finally:
        void_seam._reset_for_tests()
    assert list(void_seam.payment_void_listeners()) == before
