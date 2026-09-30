"""A5 — the document port's registries (ADR-042, contracts §1.5).

Keyed and idempotent, like every registry here: `ready()` can run twice (the test runner, the
autoreloader), so registering the same object again must be a no-op, while a second, different
listener under a used origin type is a wiring mistake that must fail at start-up rather than
route one module's voids to another.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.core.exceptions import ImproperlyConfigured

from apps.common.seams import documents as port


class _Listener:
    def on_void(self, **_: Any) -> None: ...

    def on_settlement_changed(self, **_: Any) -> None: ...

    def check_void(self, **_: Any) -> dict:
        return {"block": None, "confirm": None}


@pytest.fixture(autouse=True)
def _clean() -> Any:
    port._reset_for_tests()
    yield
    port._reset_for_tests()


def test_registering_an_origin_twice_is_a_no_op_and_a_rival_is_refused() -> None:
    listener = _Listener()
    port.register_origin("dues_due", module="dues", listener=listener)
    port.register_origin("dues_due", module="dues", listener=listener)
    assert port.origin_for("dues_due").module == "dues"
    with pytest.raises(ImproperlyConfigured, match="already registered"):
        port.register_origin("dues_due", module="dues", listener=_Listener())


def test_a_listener_missing_a_method_or_a_too_long_type_is_refused() -> None:
    class Half:
        def on_void(self, **_: Any) -> None: ...

    with pytest.raises(ImproperlyConfigured, match="check_void|on_settlement_changed"):
        port.register_origin("gym_membership", module="gym", listener=Half())
    with pytest.raises(ImproperlyConfigured, match="1–48"):
        port.register_origin("x" * 49, module="gym", listener=_Listener())


def test_reset_restores_the_start_up_state() -> None:
    """Sales registers its issuer at start-up; a test's extra origin goes away on reset and the
    issuer stays — so a test that forgets to clean up cannot leak into the next one."""
    had_issuer = port._issuer() is not None
    port.register_origin("hospitality_folio", module="hospitality", listener=_Listener())
    port._reset_for_tests()
    assert port.origin_for("hospitality_folio") is None
    assert (port._issuer() is not None) == had_issuer


def test_the_sales_issuer_is_registered_at_start_up_and_only_once() -> None:
    issuer = port._issuer()
    assert issuer is not None and type(issuer).__name__ == "SalesIssuer"
    port.register_issuer(issuer)  # the same object: a no-op
    with pytest.raises(ImproperlyConfigured, match="already registered"):
        port.register_issuer(type(issuer)())


def test_an_unregistered_origin_type_has_an_empty_void_check() -> None:
    """EC-4 — nobody listening means nothing to refuse."""
    assert port.check_void(tenant=None, origin_type="gone", origin_id="x") == {
        "block": None,
        "confirm": None,
    }


def test_labels_are_the_listeners_and_an_unknown_type_reads_record_not_found() -> None:
    class Named(_Listener):
        def labels(self, *, tenant: Any, ids: Any) -> dict:
            return {i: f"Membership {i}" for i in ids}

    port.register_origin("gym_membership", module="gym", listener=Named())
    port.register_origin("dues_due", module="dues", listener=_Listener())
    labels = port.origin_labels(
        tenant=None,
        pairs=[("gym_membership", "M1"), ("dues_due", "D1"), ("gone", "G1"), (None, None)],
    )
    assert labels == {
        ("gym_membership", "M1"): "Membership M1",
        ("dues_due", "D1"): None,
        ("gone", "G1"): "Record not found",
    }
