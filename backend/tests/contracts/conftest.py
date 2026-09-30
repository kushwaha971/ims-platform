"""Fixtures the contract suites borrow from the apps whose seams they hold to a contract."""

from apps.sales.tests.conftest import (  # noqa: F401  (fixtures)
    fake_origin,
    make_item,
    make_party,
    owner,
    port_ctx,
    reference,
    shop,
)
