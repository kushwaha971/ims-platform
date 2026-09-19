"""UPI intent links, built locally with no network call (ADR-016)."""

from __future__ import annotations

from decimal import Decimal
from urllib.parse import urlencode

from apps.common.money import q2


def build_upi_url(
    *,
    vpa: str,
    payee_name: str,
    amount: Decimal | str | None = None,
    note: str | None = None,
    reference: str | None = None,
) -> str:
    """`upi://pay?pa=…&pn=…&am=…&cu=INR` (NPCI UPI Linking Specification)."""
    params = {"pa": vpa, "pn": payee_name, "cu": "INR"}
    if amount is not None:
        params["am"] = str(q2(amount))
    if note:
        params["tn"] = note[:50]
    if reference:
        params["tr"] = reference[:35]
    return "upi://pay?" + urlencode(params)
