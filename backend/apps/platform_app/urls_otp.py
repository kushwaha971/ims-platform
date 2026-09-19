"""The retired OTP routes — included only when `UB_AUTH_OTP_ENABLED=1`.

Kept as a separate module rather than an `if` inside `urls_auth.py`'s pattern
list so that with the flag off nothing on the default path so much as imports
the OTP views, their serializers or their service.
"""

from __future__ import annotations

from django.urls import path

from apps.platform_app.views.otp import OtpRequestView, OtpVerifyView

urlpatterns = [
    path("otp/request", OtpRequestView.as_view(), name="auth-otp-request"),
    path("otp/verify", OtpVerifyView.as_view(), name="auth-otp-verify"),
]
