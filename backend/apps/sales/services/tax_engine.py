"""Compatibility re-export — the engine now lives in `apps.tax.services.tax_engine`.

Moved for PUR-01 (purchases may not import sales, Part 20 §20.1.4). This shim
keeps an import written against the old path on a parallel branch working
through the merge; new code imports from `apps.tax`. Delete once no module
under `apps/` names this path.
"""

from __future__ import annotations

from apps.tax.services.tax_engine import *  # noqa: F401,F403
from apps.tax.services.tax_engine import (  # noqa: F401  (names `*` would skip)
    AMOUNT,
    PERCENT,
    TAX_FREE_GST_TYPES,
    ZERO,
    ZERO_RATE,
    DocumentResult,
    EngineDocument,
    EngineLine,
    LineResult,
    RateNotApplicable,
    assert_invariants,
    compute_document_totals,
    resolve_rate,
)
