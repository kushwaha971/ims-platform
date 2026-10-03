"""B05 QA round 1 — failing tests for the findings (LIB-02 BR-2, BR-8; LIB-01 BR-2).

Each test names the defect it pins. They fail on 1072746b and pass once the
defect is fixed; do not loosen them to make them green.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse

from apps.library.models import LibraryCopy
from apps.platform_app.services import sequences

pytestmark = pytest.mark.django_db

TITLES = "v1:library-titles"


def _create(client: Any, count: int = 1, numbers: list | None = None) -> Any:
    copies: dict = {"count": count}
    if numbers is not None:
        copies["numbers"] = numbers
    return client.post(reverse(TITLES), {"title": "Godan", "copies": copies}, format="json")


def test_qa_b05_1_an_automatic_number_never_equals_another_copys_barcode(
    api_as: Any, library_on: Any
) -> None:
    """QA-B05-1. BR-8: a lookup code matches the accession number first, then
    the barcode, so a code that is both one copy's number and another copy's
    barcode makes the second copy unreachable by its label. BR-8 says such a
    clash "is refused when the second is created" (409 `library_code_ambiguous`).
    `_insert_copies` checks only TYPED numbers against barcodes (`_taken`);
    numbers taken from the counter are inserted unchecked. A barcode such as
    "2" (allowed: no copy is numbered 2 yet) is therefore shadowed as soon as
    the counter reaches 2. Either the create is refused with
    `library_code_ambiguous` or the counter's number must not equal a barcode;
    what must never happen is a 201 that leaves the register ambiguous."""
    client, _ = api_as(library_on, role="owner")
    first = _create(client, count=1)
    assert first.status_code == 201, first.content
    copy = LibraryCopy.objects.get(tenant=library_on)
    assert copy.accession_number == "1"
    patched = client.patch(
        reverse("v1:library-copy", args=[copy.pk]),
        {"version": copy.version, "barcode": "2"},
        format="json",
    )
    assert patched.status_code == 200, patched.content

    second = _create(client, count=1)
    if second.status_code == 409:
        assert second.json()["error"]["code"] == "library_code_ambiguous"
        return
    assert second.status_code == 201, second.content
    numbers = set(
        LibraryCopy.objects.filter(tenant=library_on).values_list("accession_number", flat=True)
    )
    barcodes = set(
        LibraryCopy.objects.filter(tenant=library_on, barcode__isnull=False).values_list(
            "barcode", flat=True
        )
    )
    assert not numbers & barcodes, f"ambiguous codes {numbers & barcodes}"
    # And the lookup still reaches the barcoded copy by its barcode.
    found = client.get(reverse("v1:library-lookup"), {"code": "2"})
    assert found.status_code == 200, found.content
    assert found.json()["data"]["copy"]["id"] == str(copy.pk)


def test_qa_b05_2_a_typed_number_at_the_counters_ceiling_cannot_be_reallocated(
    api_as: Any, library_on: Any
) -> None:
    """QA-B05-2. `_raise_for_typed` skips the raise when `highest + 1 >
    MAX_NEXT_NUMBER`, on the claim that "the counter can never reach it". That
    holds above MAX but not AT it: `raise_counter` accepts `next_number = MAX`,
    and `allocate_counter` then hands out exactly MAX. So after typing
    2147483647 the settings screen may still raise the counter to 2147483647,
    the number already on a copy. LIB-01 BR-2: the raise "refuses a number ≤
    the highest number already allocated or imported" (409 `sequence_backwards`),
    and LIB-02 BR-2's purpose is that the next automatic number never collides
    with a typed one."""
    ceiling = sequences.MAX_NEXT_NUMBER
    client, _ = api_as(library_on, role="owner")
    typed = _create(client, count=1, numbers=[str(ceiling)])
    assert typed.status_code == 201, typed.content
    raised = client.post(
        reverse("v1:library-settings-numbering"),
        {"kind": "library_accession", "next_number": ceiling},
        format="json",
    )
    assert raised.status_code == 409, raised.content
    assert raised.json()["error"]["code"] == "sequence_backwards"
