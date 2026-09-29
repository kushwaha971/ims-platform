"""Platform enumerations (Part 26 §26.16 R16.1).

Every value matches canon §0.7 and Part 21 §21.3.1 exactly, string for string.
"""

from __future__ import annotations

from django.db import models
from django.utils.translation import gettext_lazy as _


class PartnerStatus(models.TextChoices):
    ACTIVE = "active", _("Active")
    SUSPENDED = "suspended", _("Suspended")


class TenantStatus(models.TextChoices):
    """Part 21 §21.3.1 `platform_tenant.status`."""

    ACTIVE = "active", _("Active")
    SUSPENDED = "suspended", _("Suspended")
    PENDING_DELETION = "pending_deletion", _("Pending deletion")
    DELETED = "deleted", _("Deleted")


class BusinessType(models.TextChoices):
    """Part 21 §21.3.1 `platform_tenant.business_type`."""

    RETAIL = "retail", _("Retail")
    WHOLESALE = "wholesale", _("Wholesale")
    DISTRIBUTION = "distribution", _("Distribution")
    SERVICES = "services", _("Services")
    TRADER = "trader", _("Trader")
    MANUFACTURER = "manufacturer", _("Manufacturer")
    PROFESSIONAL = "professional", _("Professional")
    FOOD = "food", _("Food")
    OTHER = "other", _("Other")


class GstType(models.TextChoices):
    """Canon §0.2 `Tenant.gst_type`."""

    UNREGISTERED = "unregistered", _("Unregistered")
    COMPOSITION = "composition", _("Composition")
    REGULAR = "regular", _("Regular")


class MembershipStatus(models.TextChoices):
    """Canon §0.7 Membership."""

    INVITED = "invited", _("Invited")
    ACTIVE = "active", _("Active")
    SUSPENDED = "suspended", _("Suspended")
    REMOVED = "removed", _("Removed")


class InvitationStatus(models.TextChoices):
    """Canon §0.7 Invitation."""

    PENDING = "pending", _("Pending")
    ACCEPTED = "accepted", _("Accepted")
    EXPIRED = "expired", _("Expired")
    REVOKED = "revoked", _("Revoked")


class OtpPurpose(models.TextChoices):
    """Part 21 §21.3.1 `platform_otp_challenge.purpose`.

    Reachable only when `UB_AUTH_OTP_ENABLED=1` (DEC-010).
    """

    LOGIN = "login", _("Login")
    SIGNUP = "signup", _("Signup")
    VERIFY = "verify", _("Verify")
    RESET = "reset", _("Reset")


class AuthTokenPurpose(models.TextChoices):
    """`platform_auth_token.purpose` — the two link flows the email identity needs."""

    PASSWORD_RESET = "password_reset", _("Password reset")
    EMAIL_VERIFY = "email_verify", _("Email verification")


# ── A1 ── The release gate (ADR-041, contracts §1.1, FRD 00 PLT-X11) ─────────
#: Module codes that exist in `ModuleCode` but are not yet released to
#: merchants. A module code lands with its app's first migration, long before
#: the module is built; while it is listed here no server response names it,
#: no API accepts it and `ModuleEnabled` refuses it — unless the environment
#: sets `UB_UNRELEASED_MODULES=1` (development, CI and the e2e stack only; the
#: production settings refuse the flag at start-up).
#:
#: A module leaves this set only through its release CR, in the same commit as
#: its plan/partner data migration and its `seed_plans.MVP_MODULES` line
#: (PLT-X11 BR-4), so a fresh database and an old one converge.
UNRELEASED_MODULES: frozenset[str] = frozenset({"lending", "library", "gym", "hospitality"})
