"""The UPI pay link's two routes (Shop P0).

* `POST /payments/pay-links {amount, reference?}` — the desk's "Show UPI QR"
  in any module. Any signed-in member of the business may ask for one: it draws the
  business's own UPI ID for an amount, and moves nothing.
* `GET /public/pay/{token}` — the payer's page, without a login, with the share
  page's durable budgets and headers (`apps.common.public_views`).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.exceptions import BusinessRuleViolation
from apps.common.public_views import PublicLinkView
from apps.common.responses import StandardResponse
from apps.common.throttling import ScopedUserRateThrottle
from apps.common.viewsets import TenantScopeMixin
from apps.payments.services.pay_link import make_pay_link, resolve_pay_link


class PayLinkSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal('0.01'))
    reference = serializers.CharField(required=False, allow_blank=True, max_length=40)


class PayLinkView(TenantScopeMixin, APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedUserRateThrottle]

    def post(self, request: Any) -> Any:
        serializer = PayLinkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        link = make_pay_link(
            tenant=self.get_tenant(),
            amount=data["amount"],
            reference=data.get("reference") or "",
        )
        if link is None:
            raise BusinessRuleViolation(
                "upi_not_configured",
                "Add your UPI ID in Business profile to show a QR.",
                details={},
            )
        return StandardResponse.ok(link)


class PublicPayLinkView(PublicLinkView):
    def get(self, request: Any, token: str) -> Any:
        return StandardResponse.ok(resolve_pay_link(token))
