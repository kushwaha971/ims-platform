"""Library-local permission classes (task B03, G9 default).

`HasPermission` maps one codename per action. `GET /library/settings` is
readable by `library.settings.manage` OR any library `.read` codename (LIB-01
§10: the counter needs the loan rules), which one codename cannot say. Kept
here rather than in `common` until a second module needs it (G9).
"""

from __future__ import annotations

from typing import Any

from django.core.exceptions import ImproperlyConfigured
from django.utils.translation import gettext_lazy as _
from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.common.permissions import _authenticated_membership, _method_has_no_handler
from apps.common.permissions_registry import PERMISSIONS, permissions_for

#: Every library read codename plus the settings codename.
SETTINGS_READERS: tuple[str, ...] = tuple(
    sorted(
        {c for c in PERMISSIONS if c.startswith("library.") and c.endswith(".read")}
        | {"library.settings.manage"}
    )
)


def HasAnyPermission(*codenames: str) -> type[BasePermission]:
    """Passes when the member holds at least one of `codenames`. Read-only use:
    an unsafe method is refused, so it can never widen a write."""
    unknown = set(codenames) - PERMISSIONS
    if not codenames or unknown:
        raise ImproperlyConfigured(f"Unknown permission codename(s): {sorted(unknown)}")
    wanted = frozenset(codenames)

    class _HasAnyPermission(BasePermission):
        message = _("You do not have permission to do this.")

        def has_permission(self, request: Any, view: Any) -> bool:
            if _method_has_no_handler(request, view):
                return True
            if request.method not in SAFE_METHODS:
                return False
            membership = _authenticated_membership(request)
            if membership is None:
                return False
            return bool(wanted & permissions_for(membership))

    _HasAnyPermission.__name__ = "HasAnyPermission_" + "_".join(sorted(wanted))[:60]
    return _HasAnyPermission
