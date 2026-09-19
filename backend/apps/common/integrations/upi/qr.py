"""QR rendering placeholder (ADR-016, Part 20 §20.10.3).

The QR encoder is Sprint 6 work (`PAY-04`). It is named here so the module path
in Part 20 §20.2.2 exists and so nothing invents a different one later.
"""

from __future__ import annotations


def svg_qr(payload: str) -> str:
    raise NotImplementedError("PAY-04 builds the local QR encoder (Part 20 §20.10.3).")
