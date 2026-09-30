"""A5 (R2, ADR-057) — `tax.selectors.codes.code_for_rate`: a rate is only a convenience.

The document port's `DocumentLine.tax_code` is THE tax field; a module that sends `gst_rate`
instead gets it mapped to the one code active on the document date. Four codes are 0%
(GST0, EXEMPT, NIL, NONGST) and they are not the same supply in GSTR-1, so a rate two codes
share is refused rather than guessed (BR-7).
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest

from apps.tax.selectors.codes import RateNotResolved, code_for_rate

pytestmark = pytest.mark.django_db

AFTER_REFORM = dt.date(2026, 10, 1)
BEFORE_REFORM = dt.date(2025, 9, 1)


@pytest.fixture
def rates(db: Any) -> None:
    from apps.common.management.commands.seed_reference_data import seed_tax_rates

    seed_tax_rates()


def test_a_rate_one_code_carries_maps_to_that_code(rates: None, tenant: Any) -> None:
    """The gym worked example: 18% on 1 Oct 2026 is GST18."""
    assert code_for_rate(tenant, Decimal("18"), AFTER_REFORM) == "GST18"
    assert code_for_rate(tenant, "5.000", AFTER_REFORM) == "GST5"


def test_a_rate_is_looked_up_on_the_document_date(rates: None, tenant: Any) -> None:
    """12% ended on the 2025-09-21 boundary: a backdated document still finds it, a new one
    does not — the same by-date rule every rate lookup in `tax` follows."""
    assert code_for_rate(tenant, Decimal("12"), BEFORE_REFORM) == "GST12"
    with pytest.raises(RateNotResolved) as caught:
        code_for_rate(tenant, Decimal("12"), AFTER_REFORM)
    assert caught.value.reason == "none"
    assert str(caught.value) == "No tax code for 12% on 01/10/2026."


def test_a_rate_several_codes_share_is_refused(rates: None, tenant: Any) -> None:
    """BR-7 — 0% is GST0, EXEMPT, NIL and NONGST: the caller must say which."""
    with pytest.raises(RateNotResolved) as caught:
        code_for_rate(tenant, Decimal("0"), AFTER_REFORM)
    assert caught.value.reason == "several"
    assert str(caught.value) == "Several tax codes are 0%; send tax_code."


def test_a_tenant_row_shadows_the_global_code(rates: None, tenant: Any, other_tenant: Any) -> None:
    """A tenant's own row for a code replaces the global one for that tenant only, so a rate
    is matched against what the tenant would actually be charged."""
    from apps.tax.models import TaxRate

    TaxRate.objects.create(
        tenant=tenant,
        code="GST18",
        name="GST 18% (own)",
        rate=Decimal("17.500"),
        cess_rate=Decimal("0"),
        effective_from=dt.date(2017, 7, 1),
        is_active=True,
    )
    with pytest.raises(RateNotResolved):
        code_for_rate(tenant, Decimal("18"), AFTER_REFORM)
    assert code_for_rate(tenant, Decimal("17.5"), AFTER_REFORM) == "GST18"
    assert code_for_rate(other_tenant, Decimal("18"), AFTER_REFORM) == "GST18"


def test_a_rate_that_is_not_a_number_is_refused(rates: None, tenant: Any) -> None:
    with pytest.raises(RateNotResolved) as caught:
        code_for_rate(tenant, "eighteen", AFTER_REFORM)
    assert caught.value.reason == "invalid"
