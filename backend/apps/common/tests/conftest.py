"""Fixtures for the cross-cutting suites in `common` (Sprint 12).

The scheduler double-run proof and the PII sweep drive real sales, purchase and
ledger flows, so they need the sales track's GST shop — imported here, the way
`payments/tests/conftest.py` does, rather than copied.
"""

from __future__ import annotations

from apps.sales.tests.conftest import (  # noqa: F401  (fixtures, re-exported)
    make_item,
    make_party,
    owner,
    reference,
    shop,
)
