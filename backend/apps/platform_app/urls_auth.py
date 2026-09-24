"""Auth routes — `/api/v1/auth/*` (canon §0.8, Part 22 §22.2).

Paths are copied from canon §0.8 character for character where canon has them.
`trailing_slash` is absent everywhere in this product, so none of these carry
one.

Two departures from canon §0.8's inventory, both from DEC-010, both carried to
`CR-LOG`:

* `POST /auth/register` is new. Canon §0.8 has no registration path because
  sign-up was a side effect of `POST /auth/otp/verify`; with no challenge step
  there has to be a route that creates the account.
* `POST /auth/otp/request` and `POST /auth/otp/verify` are registered only when
  `UB_AUTH_OTP_ENABLED=1`, which is off. With the flag off they are not in the
  URL map at all, so they 404 and `reverse()` does not resolve them.

`POST /auth/email/verify/request` and `/confirm` are additions too, and are
always registered: the address-verification *plumbing* exists at MVP even
though verification gates nothing.
"""

from __future__ import annotations

from django.conf import settings
from django.urls import path

from apps.platform_app.views.auth import (
    EmailVerifyConfirmView,
    EmailVerifyRequestView,
    LogoutView,
    MeView,
    PasswordLoginView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    PasswordSetView,
    RefreshView,
    RegisterView,
    SwitchTenantView,
)
from apps.platform_app.views.settings import SessionDetailView, SessionListView

urlpatterns = [
    path("register", RegisterView.as_view(), name="auth-register"),
    path("login", PasswordLoginView.as_view(), name="auth-login"),
    path("refresh", RefreshView.as_view(), name="auth-refresh"),
    path("logout", LogoutView.as_view(), name="auth-logout"),
    path("me", MeView.as_view(), name="auth-me"),
    path("switch-tenant", SwitchTenantView.as_view(), name="auth-switch-tenant"),
    # PLT-09 (CR-013).
    path("sessions", SessionListView.as_view(), name="auth-sessions"),
    path("sessions/<uuid:session_id>", SessionDetailView.as_view(), name="auth-session-detail"),
    path("password/set", PasswordSetView.as_view(), name="auth-password-set"),
    path(
        "password/reset/request",
        PasswordResetRequestView.as_view(),
        name="auth-password-reset-request",
    ),
    path(
        "password/reset/confirm",
        PasswordResetConfirmView.as_view(),
        name="auth-password-reset-confirm",
    ),
    path(
        "email/verify/request",
        EmailVerifyRequestView.as_view(),
        name="auth-email-verify-request",
    ),
    path(
        "email/verify/confirm",
        EmailVerifyConfirmView.as_view(),
        name="auth-email-verify-confirm",
    ),
]

if settings.UB_AUTH_OTP_ENABLED:  # DEC-010 — off by default
    from apps.platform_app.urls_otp import urlpatterns as otp_urlpatterns

    urlpatterns += otp_urlpatterns
