"""The app registry: the products a business runs (docs/platform/14 §4.2).

"Module" in this codebase means a CAPABILITY — a unit of entitlement and of
permission codenames (`parties`, `ledger`, `sales`, `library`, `dues`…). An
APP is a product a business runs: Shop & billing, Library, Lending &
collections, and later Gym, Hotel and whatever comes next. An app owns a menu,
a home page, its words and its setup, and it USES capabilities, some of them
shared with other apps (the library and lending both use `parties`, `ledger`,
`payments` and `dues`).

Until this registry the app existed only as a tag on one shared menu list in
the frontend, which is why every app looked alike (R6, R7). Each app now
registers itself from its own `AppConfig.ready()` — the Shop from
`PlatformAppConfig`, the verticals from theirs — and the platform shell knows
apps only through this registry, never by name.

**Per-person access** (owner decision 1, §6): a business's owner is in every
app the business runs. Anyone else is in the apps they hold a grant for
(`platform_membership_app_grant`), with a role per app. A membership with no
grants at all is a legacy row from before grants existed: its one role covers
every app, exactly as it always did, until the owner sets grants.

Registries follow ADR-042: idempotent for an equal spec, a conflict raises,
`_reset_for_tests` restores the start-up snapshot.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

from django.core.exceptions import ImproperlyConfigured

#: Capabilities that belong to the BUSINESS, not to any app: who is on the team,
#: the business's own settings and calendar, the person's inbox and help. A
#: member keeps these from their business role whatever their app grants say.
BUSINESS_CAPABILITIES: frozenset[str] = frozenset({"platform", "team", "notifications", "help"})


@dataclass(frozen=True, slots=True)
class AppSpec:
    #: Stable code, `[a-z]+`, at most 32 characters. Never renamed: grants,
    #: `membership.last_app` and every client store it.
    code: str
    #: The message id the client renders (a brand-free product name).
    label_id: str
    #: The capability whose presence makes this app exist for a business. A
    #: business runs the app iff its effective modules include the anchor.
    anchor: str
    #: Every capability a grant to this app covers: the app's own and the
    #: shared engines it uses. A member's role in this app yields only codenames
    #: of these capabilities.
    capabilities: frozenset[str]
    #: What a person must hold to open the app (used for legacy, grant-less
    #: memberships, and to keep a grant with a role that cannot open it shut).
    entry_permission: str
    #: The app's first page, an absolute client path.
    home_path: str
    #: Order in the switcher and the default when nothing else decides.
    order: int


_APPS: dict[str, AppSpec] = {}
_APPS_BASELINE: dict[str, AppSpec] | None = None


def register_app(spec: AppSpec) -> None:
    problems: list[str] = []
    if not spec.code.isalpha() or not spec.code.islower() or len(spec.code) > 32:
        problems.append(f"app code {spec.code!r} must be lowercase letters, at most 32")
    if spec.anchor not in spec.capabilities:
        problems.append(f"{spec.code}: its anchor {spec.anchor!r} must be one of its capabilities")
    if spec.capabilities & BUSINESS_CAPABILITIES:
        problems.append(f"{spec.code}: business capabilities belong to no app")
    if not spec.home_path.startswith("/"):
        problems.append(f"{spec.code}: home_path must be an absolute path")
    if problems:
        raise ImproperlyConfigured("; ".join(problems))
    existing = _APPS.get(spec.code)
    if existing is not None:
        if existing == spec:
            return
        raise ImproperlyConfigured(f"App {spec.code!r} is already registered.")
    _APPS[spec.code] = spec


def registered_apps() -> tuple[AppSpec, ...]:
    return tuple(sorted(_APPS.values(), key=lambda a: (a.order, a.code)))


def app_spec(code: str) -> AppSpec | None:
    return _APPS.get(code)


def _reset_for_tests() -> None:  # pragma: no cover - test helper
    global _APPS_BASELINE
    if _APPS_BASELINE is None:
        _APPS_BASELINE = dict(_APPS)
    _APPS.clear()
    _APPS.update(_APPS_BASELINE)


# ── Which apps a business runs, and which a person can open ──────────────────


def apps_of_business(tenant: Any) -> tuple[AppSpec, ...]:
    """The apps a business runs: its effective modules include the app's anchor."""
    from apps.platform_app.services.entitlements import effective_modules

    effective = effective_modules(tenant)
    return tuple(a for a in registered_apps() if a.anchor in effective)


def addable_apps(tenant: Any) -> tuple[AppSpec, ...]:
    """The apps this business could start running: not running yet, and its plan
    (and partner) includes the app's anchor. An unreleased app is never offered
    (`modules_view` already leaves hidden modules out of `available`).
    """
    from apps.platform_app.services.tenant_settings import modules_view

    available = set(modules_view(tenant)["available"])
    running = {a.code for a in apps_of_business(tenant)}
    return tuple(a for a in registered_apps() if a.code not in running and a.anchor in available)


def grants_of(membership: Any) -> dict[str, Any]:
    """`{app_code: role}` for a membership, cached on the instance for the request.

    `permissions_for` runs on every permission check, so this is read at most
    once per membership object, and a grant-less (legacy) row costs one query.
    """
    cached = getattr(membership, "_ub_app_grants", None)
    if cached is not None:
        return cached
    from apps.platform_app.models import MembershipAppGrant

    if getattr(membership, "pk", None) is None:
        grants: dict[str, Any] = {}
    else:
        grants = {
            g.app: g.role
            for g in MembershipAppGrant.objects.filter(membership_id=membership.pk).select_related(
                "role"
            )
        }
    try:
        membership._ub_app_grants = grants
    except AttributeError:  # pragma: no cover - a frozen stand-in
        pass
    return grants


def is_business_owner(membership: Any) -> bool:
    return getattr(getattr(membership, "role", None), "code", None) == "owner"


def accessible_apps(membership: Any, permissions: Iterable[str]) -> tuple[AppSpec, ...]:
    """The apps this person can open in this business, in switcher order.

    Owner: every app the business runs. Grants set: exactly the granted apps
    the business runs, and whose role opens it. No grants (legacy): every app
    the business runs whose entry permission the person's role holds.
    """
    if membership is None:
        return ()
    held = set(permissions)
    running = apps_of_business(membership.tenant)
    if is_business_owner(membership):
        return running
    grants = grants_of(membership)
    if grants:
        return tuple(a for a in running if a.code in grants and a.entry_permission in held)
    return tuple(a for a in running if a.entry_permission in held)


def active_app(membership: Any, apps: tuple[AppSpec, ...]) -> AppSpec | None:
    """The app this person is in: the one they used last here, else the first."""
    if not apps:
        return None
    last = getattr(membership, "last_app", "") or ""
    return next((a for a in apps if a.code == last), apps[0])


# ── App setup (docs/platform/14 step 5) ──────────────────────────────────────


@dataclass(frozen=True, slots=True)
class SetupStep:
    """One line of an app's setup checklist, as its home shows it.

    `done` is a fact about the business's data ("a fee plan exists"), never a
    box someone ticked, so the list cannot claim something the books do not
    show. `permission` is what doing the step needs: a person is shown only the
    steps they could do.
    """

    key: str
    label_id: str
    path: str
    done: bool
    permission: str


_SETUP: dict[str, Any] = {}


def register_app_setup(code: str, steps: Any) -> None:
    """Register `steps(tenant) -> list[SetupStep]` for an app (idempotent per callable)."""
    existing = _SETUP.get(code)
    if existing is not None and existing is not steps:
        raise ImproperlyConfigured(f"App {code!r} already has a setup checklist.")
    _SETUP[code] = steps


def app_setup(code: str) -> Any:
    return _SETUP.get(code)


def app_json(spec: AppSpec) -> dict:
    return {
        "code": spec.code,
        "label_id": spec.label_id,
        "home_path": spec.home_path,
        "order": spec.order,
    }
