"""The check-in policy and mark-listener registries (contracts §2.3, ADR-042).

A vertical registers, from its own `ready()`, whether a party MAY come in
(`register_checkin_policy`) and what happens when a mark changes
(`register_mark_listener`). The engine never imports the vertical and never
reads dues or memberships (ADR-050): it asks the policy registered for the
mark's `context_type`.

Rules, the `register_schedule` / dues `register_subject` shape:

* keyed — a policy by `context_type`, a listener by `(context_type, on_marked)`;
* registering an equal entry again is a no-op (a second `ready()` is harmless);
* a different entry under a used key is `ImproperlyConfigured` — a start-up
  error rather than whichever app imported last;
* `_reset_for_tests()` snapshots the start-up state on its first call and
  restores it on every later one.

EC-2: an unregistered context type is REFUSED (`policy_for` raises), never
allowed by default.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from typing import Any, TypedDict
from uuid import UUID

from django.core.exceptions import ImproperlyConfigured

from apps.attendance.constants import CONTEXT_TYPE_MAX, MODULE_MAX, Decision


class PolicyResult(TypedDict, total=False):
    decision: str  # "allow" | "warn" | "block"
    reason: str  # shown to the desk
    override_permission: str | None  # e.g. "gym.membership.override"
    entitlement_id: UUID | None  # consume one use of this entitlement


Policy = Callable[[Any, UUID, UUID | None, date], PolicyResult]
Listener = Callable[..., None]


@dataclass(frozen=True)
class RegisteredPolicy:
    context_type: str
    module: str
    policy: Policy


@dataclass(frozen=True)
class RegisteredListener:
    context_type: str
    module: str
    on_marked: Listener


_POLICIES: dict[str, RegisteredPolicy] = {}
_LISTENERS: list[RegisteredListener] = []
_BASELINE: tuple[dict[str, RegisteredPolicy], list[RegisteredListener]] | None = None


def _check_keys(context_type: str, module: str, kind: str) -> None:
    if not context_type or len(context_type) > CONTEXT_TYPE_MAX:
        raise ImproperlyConfigured(
            f"attendance {kind} context type {context_type!r} must be 1–{CONTEXT_TYPE_MAX} characters"
        )
    if not module or len(module) > MODULE_MAX:
        raise ImproperlyConfigured(f"attendance {kind} {context_type!r} needs a module code")


def register_checkin_policy(context_type: str, *, module: str, policy: Policy) -> None:
    """`policy(tenant, party_id, context_id, on) -> PolicyResult` (contracts §2.3)."""
    _check_keys(context_type, module, "policy")
    if not callable(policy):
        raise ImproperlyConfigured(f"attendance policy {context_type!r} is not callable")
    entry = RegisteredPolicy(context_type=context_type, module=module, policy=policy)
    existing = _POLICIES.get(context_type)
    if existing is not None and existing != entry:
        raise ImproperlyConfigured(
            f"attendance policy {context_type!r} is already registered differently "
            f"(by {existing.module!r})"
        )
    _POLICIES[context_type] = entry


def register_mark_listener(context_type: str, *, module: str, on_marked: Listener) -> None:
    """`on_marked(ctx, mark, created: bool)`, synchronous, inside the transaction.

    Several listeners per context type are allowed and run in registration
    order; a listener may refuse by raising, which rolls the mark back."""
    _check_keys(context_type, module, "listener")
    if not callable(on_marked):
        raise ImproperlyConfigured(f"attendance listener {context_type!r} is not callable")
    entry = RegisteredListener(context_type=context_type, module=module, on_marked=on_marked)
    for existing in _LISTENERS:
        if existing.context_type == context_type and existing.on_marked == on_marked:
            if existing != entry:
                raise ImproperlyConfigured(
                    f"attendance listener for {context_type!r} is already registered "
                    f"for module {existing.module!r}"
                )
            return
    _LISTENERS.append(entry)


def policy_for(context_type: str) -> RegisteredPolicy:
    """The registered policy, or `ImproperlyConfigured` (EC-2: refuse, never allow)."""
    entry = _POLICIES.get(context_type)
    if entry is None:
        raise ImproperlyConfigured(
            f"no attendance check-in policy is registered for {context_type!r}"
        )
    return entry


def listeners_for(context_type: str) -> list[RegisteredListener]:
    return [entry for entry in _LISTENERS if entry.context_type == context_type]


def registered_policies() -> dict[str, RegisteredPolicy]:
    """Every registered policy, by context type (a copy) — for the contract test."""
    return dict(_POLICIES)


def normalise(result: Any) -> PolicyResult:
    """A policy's answer, checked: an unknown decision is a policy bug, not an allow."""
    if not isinstance(result, dict) or result.get("decision") not in Decision.values:
        raise ImproperlyConfigured(f"attendance policy answered {result!r}")
    return PolicyResult(
        decision=result["decision"],
        reason=str(result.get("reason") or ""),
        override_permission=result.get("override_permission"),
        entitlement_id=result.get("entitlement_id"),
    )


def _reset_for_tests() -> None:  # pragma: no cover - test helper
    global _BASELINE
    if _BASELINE is None:
        _BASELINE = (dict(_POLICIES), list(_LISTENERS))
    _POLICIES.clear()
    _POLICIES.update(_BASELINE[0])
    _LISTENERS[:] = _BASELINE[1]
