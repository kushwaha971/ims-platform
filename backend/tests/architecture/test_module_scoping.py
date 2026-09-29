"""Row scoping and module roles, as architecture (A13, ADR-052, ADR-058, R25).

T-PLT-X12-3 and -5. These are rules about the SHAPE of the code rather than one
request, so they hold for every vertical the day it lands:

* every view in a vertical app is scoped (`ScopedViewSetMixin`) or says why not
  (`scope_exempt = "<reason>"`), so a new screen cannot quietly show a
  collection agent the whole book;
* no module role holds a tenant-wide core read, a `read_all` or a codename of
  another module;
* no codename named for ENGINE reads is held by a scoped role, because engine
  reads apply no vertical scope (R25) — a trainer holding `gym.member.read_all`
  would read every mark of the tenant through `/api/v1/attendance/`;
* `read_all` codenames are held by owner, admin and accountant (BR-4), and a
  `.reveal` codename never reaches the accountant's automatic read set (ADR-058).

The first rule is proven against a planted module, so the walk cannot pass by
finding nothing.
"""

from __future__ import annotations

import importlib
import inspect
import pkgutil
import types

from django.apps import apps as django_apps
from rest_framework.views import APIView

from apps.common import permissions_registry as reg
from apps.common.scoping import ScopedViewSetMixin

VERTICAL_APPS = ("lending", "library", "gym", "hospitality")
BR3_FORBIDDEN = {"parties.party.read", "ledger.entry.read", "payments.payment.read"}


def unscoped_views(module: types.ModuleType) -> list[str]:
    """Views DEFINED in `module` that neither scope nor declare an exemption."""
    offenders = []
    for name, obj in vars(module).items():
        if not (inspect.isclass(obj) and issubclass(obj, APIView)):
            continue
        if obj.__module__ != module.__name__:
            continue  # imported, judged where it is defined
        if issubclass(obj, ScopedViewSetMixin):
            continue
        reason = getattr(obj, "scope_exempt", "")
        if isinstance(reason, str) and reason.strip():
            continue
        offenders.append(f"{module.__name__}.{name}")
    return offenders


def _view_modules(app_label: str) -> list[types.ModuleType]:
    package = f"apps.{app_label}"
    modules = []
    for candidate in (f"{package}.views", f"{package}.api"):
        try:
            root = importlib.import_module(candidate)
        except ModuleNotFoundError:
            continue
        modules.append(root)
        for info in pkgutil.walk_packages(getattr(root, "__path__", []), prefix=f"{candidate}."):
            modules.append(importlib.import_module(info.name))
    return modules


def test_every_vertical_view_is_scoped_or_declares_why_not() -> None:
    """T-PLT-X12-5: the vertical apps that exist are walked; none may carry a
    view that is neither scoped nor explicitly exempt."""
    installed = {config.name.removeprefix("apps.") for config in django_apps.get_app_configs()}
    offenders: list[str] = []
    for app_label in VERTICAL_APPS:
        if app_label in installed:
            for module in _view_modules(app_label):
                offenders.extend(unscoped_views(module))
    assert offenders == [], offenders


def test_the_scope_walk_catches_a_planted_unscoped_view() -> None:
    """The walk above passes trivially while no vertical exists, so it is
    proven here against a planted module: an unscoped view is caught, a scoped
    one and an exempt one are not, and an imported base is not judged twice."""
    planted = types.ModuleType("apps.planted.views")

    class Leaky(APIView):
        pass

    class Scoped(ScopedViewSetMixin, APIView):
        pass

    class Exempt(APIView):
        scope_exempt = "The route list is the same for every agent."

    class BlankExempt(APIView):
        scope_exempt = "   "

    for cls in (Leaky, Scoped, Exempt, BlankExempt):
        cls.__module__ = planted.__name__
        setattr(planted, cls.__name__, cls)
    planted.APIView = APIView  # imported, not defined here
    assert sorted(unscoped_views(planted)) == [
        "apps.planted.views.BlankExempt",
        "apps.planted.views.Leaky",
    ]


def test_no_module_role_holds_a_core_read_a_read_all_or_another_modules_codename() -> None:
    """T-PLT-X12-3 / BR-3, over every role the verticals registered."""
    for spec in reg.module_roles():
        assert not spec.codenames & BR3_FORBIDDEN, spec.code
        for codename in spec.codenames:
            assert reg.MODULE_OF[codename] == spec.module, (spec.code, codename)
            assert not codename.endswith(".read_all"), (spec.code, codename)
            assert not codename.startswith("reports."), (spec.code, codename)


def test_no_scoped_role_holds_an_engine_read_codename() -> None:
    """R25 / ADR-058: engine reads apply no vertical scope, so the codename a
    module names for them must be one no module role holds."""
    engine_codenames = {
        codename
        for by_module in reg.ENGINE_READ_PERMISSIONS.values()
        for codename in by_module.values()
    }
    for spec in reg.module_roles():
        assert not spec.codenames & engine_codenames, spec.code


def test_engine_read_codenames_are_read_all_or_named_reads_of_their_own_module() -> None:
    """Each codename belongs to the module that named it."""
    for engine, by_module in reg.ENGINE_READ_PERMISSIONS.items():
        for module, codename in by_module.items():
            assert codename.split(".", 1)[0] == module, (engine, module, codename)


def test_read_all_is_held_by_owner_admin_and_explicitly_accountant() -> None:
    """BR-4: the accountant's set is built from `.endswith(".read")`, which does
    not match `.read_all` — so each module's CR must add it explicitly."""
    for codename in (p for p in reg.PERMISSIONS if p.endswith(".read_all")):
        for role in ("owner", "admin", "accountant"):
            assert codename in reg.ROLE_PERMISSIONS[role], (role, codename)


def test_a_reveal_codename_never_reaches_the_accountant_by_default() -> None:
    """ADR-058: identity fields are behind `.reveal`, which the accountant's
    automatic read set must never include."""
    assert not {p for p in reg.ROLE_PERMISSIONS["accountant"] if p.endswith(".reveal")}
