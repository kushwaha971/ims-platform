"""`build_upi_url()` — the UPI deep link a QR encodes (SAL-03 FR-4, BR-3; PAY-03).

Built server-side so the encoding is canonical (§14): every value is
percent-encoded (a space is `%20`, never `+`, which some UPI apps show
literally), the amount always carries two decimals, `tn` is capped at 50
characters and `tr` at 12 — the reconciliation key printed on the receipt.
A URL without `am` is the static VPA QR, for a document with nothing due.
"""

from __future__ import annotations

import re
from decimal import Decimal
from urllib.parse import quote

VPA_RE = re.compile(r"^[\w.\-]{2,256}@[a-zA-Z]{2,64}$")


def valid_vpa(vpa: str | None) -> bool:
    return bool(vpa) and bool(VPA_RE.match(str(vpa)))


def build_upi_url(
    *,
    pa: str,
    pn: str,
    am: Decimal | None = None,
    tn: str | None = None,
    tr: str | None = None,
) -> str:
    params: list[tuple[str, str]] = [("pa", pa), ("pn", pn[:99])]
    if am is not None and am > 0:
        params.append(("am", f"{am.quantize(Decimal('0.01'))}"))
    params.append(("cu", "INR"))
    if tn:
        params.append(("tn", tn[:50]))
    if tr:
        params.append(("tr", tr[:12]))
    return "upi://pay?" + "&".join(f"{k}={quote(v, safe='@.-_')}" for k, v in params)
