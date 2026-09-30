"""T-PLT-X06-6 — a module's reminder templates never use its forbidden words (A7, BR-9).

Lending's policy carries `forbidden_words` (threats, legal-sounding pressure):
the rule is enforced HERE, over every registered template of that module, not at
runtime — the words are fixed at build time, so a runtime check would only turn
a reviewable string into a production refusal. Parametrised over every policy
registered at start-up; with none registered yet (Wave A), the stand-in module
proves the check can fail.
"""

from __future__ import annotations

import re
from typing import Any

import pytest

from apps.ledger.services import reminder_seam
from apps.ledger.tests.module_reminder_fixtures import test_module  # noqa: F401  (fixtures)
from apps.notifications.services.templates import DEFAULT_TEMPLATES


def offending_templates(module: str) -> list[tuple[str, str]]:
    """`[(template key, word)]` for every body of `module` that uses a forbidden word."""
    policy = reminder_seam.registered_policy(module) or {}
    words = policy.get("forbidden_words") or frozenset()
    found = []
    for (code, channel, locale), body in DEFAULT_TEMPLATES.items():
        if not code.startswith(f"{module}_"):
            continue
        for word in words:
            if re.search(rf"\b{re.escape(word)}\b", body, flags=re.IGNORECASE):
                found.append((f"{code}/{channel}/{locale}", word))
    return found


POLICED = [
    module
    for module, policy in sorted(reminder_seam._POLICIES.items())
    if policy.get("forbidden_words")
]


@pytest.mark.parametrize("module", POLICED)
def test_registered_templates_use_no_forbidden_word(module: str) -> None:
    assert offending_templates(module) == []


def test_the_check_catches_a_forbidden_word(test_module: Any) -> None:
    """Not vacuous: a template that threatens the police is caught."""
    from apps.notifications.services.templates import register_default_templates

    assert offending_templates("test") == []
    register_default_templates(
        {"test_final_warning": {"sms": {"en": "Pay today or we call the Police."}}}
    )
    assert offending_templates("test") == [("test_final_warning/sms/en", "police")]
