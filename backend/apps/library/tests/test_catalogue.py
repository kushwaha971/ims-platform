"""B05 — the catalogue (LIB-02, T-LIB-02-3…6, -8 and the design note's cases)."""

from __future__ import annotations

import random
from typing import Any

import pytest
from django.core.management import call_command
from django.db import IntegrityError, transaction
from django.urls import reverse

from apps.common.audit import AuditAction
from apps.common.context import Ctx
from apps.library.constants import CopyStatus, TitleStatus
from apps.library.models import LibraryCategory, LibraryCopy, LibraryCopyEvent, LibraryTitle
from apps.library.services import catalogue, copy_status
from apps.platform_app.models import AuditLog
from apps.platform_app.services import sequences

pytestmark = pytest.mark.django_db

TITLES = "v1:library-titles"


def _create(client: Any, count: int = 1, numbers: list | None = None, **extra: Any) -> Any:
    copies: dict = {"count": count}
    if numbers is not None:
        copies["numbers"] = numbers
    body = {"title": "Wings of Fire", "authors": "A. P. J. Abdul Kalam", "copies": copies, **extra}
    return client.post(reverse(TITLES), body, format="json")


def _peek(tenant: Any) -> int:
    return sequences.peek_counter(tenant=tenant, kind="library_accession")


# ── Numbers (T-LIB-02-3, -4, BR-1) ───────────────────────────────────────────


def test_the_register_refuses_a_reused_number_in_any_case(library_on: Any) -> None:
    """T-LIB-02-3 / FR-5: `4513` twice, `r-1` against `R-1`, and a withdrawn
    copy's number all hit the unique index — a number is never reused."""
    title = LibraryTitle.objects.create(tenant=library_on, title="T")

    def copy(number: str, **kw: Any) -> LibraryCopy:
        return LibraryCopy.objects.create(
            tenant=library_on, title=title, accession_number=number, accession_sort=number, **kw
        )

    copy("4513")
    copy("r-1")
    copy("77", status=CopyStatus.WITHDRAWN, withdrawn_on="2026-10-01")
    for number in ("4513", "R-1", "77"):
        with pytest.raises(IntegrityError), transaction.atomic():
            copy(number)


def test_automatic_numbers_are_consecutive_and_announced(api_as: Any, library_on: Any) -> None:
    """FR-4: three copies take 1, 2, 3 from the counter; the response names
    them for the "print numbers" slip, and the caches say 3 of 3."""
    client, member = api_as(library_on, role="staff")
    assert member.role.code == "staff"
    response = _create(client, count=3)
    assert response.status_code == 201, response.content
    body = response.json()
    assert body["meta"]["created_numbers"] == ["1", "2", "3"]
    assert (body["data"]["copies_total"], body["data"]["copies_available"]) == (3, 3)
    assert "holds_waiting" not in body["data"] and "issues_12m" not in body["data"]
    assert LibraryCopyEvent.objects.filter(reason_code="created").count() == 3
    assert _peek(library_on) == 4


def test_a_typed_number_raises_the_counter_and_a_suffixed_one_does_not(
    api_as: Any, library_on: Any
) -> None:
    """T-LIB-02-4 / BR-2, BR-3: typing 9000 moves the counter to 9001 with one
    audit row; `4512-A` never moves it."""
    client, _ = api_as(library_on, role="owner")
    assert _create(client, count=1, numbers=["4512-A"]).status_code == 201
    assert _peek(library_on) == 1
    assert _create(client, count=1, numbers=["9000"]).status_code == 201
    assert _peek(library_on) == 9001
    rows = AuditLog.objects.filter(tenant=library_on, action=AuditAction.COUNTER_RAISED)
    assert [r.after["via"] for r in rows] == ["typed"]


def test_a_number_beyond_the_counters_range_is_kept_and_does_not_raise_it(
    api_as: Any, library_on: Any
) -> None:
    """B04 QA note 1: an all-digit number of 2,147,483,647 or more cannot be
    passed to `raise_counter` (its column cannot hold the number + 1), and the
    counter can never reach it, so it cannot collide. It is accepted as typed;
    before this, the create failed with a `next_number` error on a field the
    merchant never saw."""
    client, _ = api_as(library_on, role="owner")
    response = _create(client, count=1, numbers=["99999999999"])
    assert response.status_code == 201, response.content
    assert _peek(library_on) == 1
    edge = _create(client, count=1, numbers=[str(sequences.MAX_NEXT_NUMBER - 1)])
    assert edge.status_code == 201
    assert _peek(library_on) == sequences.MAX_NEXT_NUMBER


def test_a_taken_number_on_copy_three_rolls_the_whole_create_back(
    api_as: Any, library_on: Any
) -> None:
    """BR-1: the 409 names the number, the copy and its title; nothing of the
    refused create survives — not the title, not copies 1–2, not the counter."""
    client, _ = api_as(library_on, role="owner")
    first = _create(client, count=1, numbers=["1025"], title="Godaan")
    assert first.status_code == 201
    taken_copy = LibraryCopy.objects.get(accession_number="1025")
    before = (LibraryTitle.objects.count(), LibraryCopy.objects.count(), _peek(library_on))
    refused = _create(client, count=3, numbers=["2001", "2002", "1025"])
    assert refused.status_code == 409
    error = refused.json()["error"]
    assert error["code"] == "library_accession_taken"
    assert error["details"] == {"number": "1025", "copy_id": str(taken_copy.id), "title": "Godaan"}
    assert (LibraryTitle.objects.count(), LibraryCopy.objects.count(), _peek(library_on)) == before


@pytest.mark.parametrize(
    "copies",
    [
        {"count": 2, "numbers": ["5", "5"]},
        {"count": 2, "numbers": ["5"]},
        {"count": 201},
        {"count": 0},
        {"count": 1, "numbers": ["४५"]},
    ],
)
def test_a_bad_copies_block_is_400_before_any_write(
    api_as: Any, library_on: Any, copies: dict
) -> None:
    """EC-1 and LIB-02 §9: repeats, a count mismatch, more than 200 and an
    illegal number are refused before a row or a number is taken."""
    client, _ = api_as(library_on, role="owner")
    response = client.post(reverse(TITLES), {"title": "X", "copies": copies}, format="json")
    assert response.status_code == 400, response.content
    assert LibraryTitle.objects.count() == 0 and _peek(library_on) == 1


def test_isbn_is_normalised_validated_and_a_duplicate_only_warns(
    api_as: Any, library_on: Any
) -> None:
    """LIB-02 §9 and BR-5: either form is stored as the ISBN-13; a bad check
    digit is 400 on `isbn13`; a second title with the same ISBN is a 201 with a
    warning (reprints and sets share ISBNs)."""
    client, _ = api_as(library_on, role="owner")
    first = _create(client, isbn="81-7371-146-1")
    assert first.json()["data"]["isbn13"] == "9788173711466"
    bad = _create(client, isbn="817371146X")
    assert bad.status_code == 400 and "isbn13" in bad.json()["error"]["details"]
    second = _create(client, isbn="978-81-7371-146-6")
    assert second.status_code == 201
    assert second.json()["meta"]["warnings"] == [
        {"code": "isbn_exists", "title_id": first.json()["data"]["id"]}
    ]


def test_creating_a_title_is_idempotent_by_key(api_as: Any, library_on: Any) -> None:
    """A retried create (the counter's flaky Wi-Fi) must not add a second
    title and three more numbers."""
    client, _ = api_as(library_on, role="owner")
    body = {"title": "Godaan", "copies": {"count": 3}}
    headers = {"HTTP_IDEMPOTENCY_KEY": "add-godaan-1"}
    one = client.post(reverse(TITLES), body, format="json", **headers)
    two = client.post(reverse(TITLES), body, format="json", **headers)
    assert one.status_code == two.status_code == 201
    assert LibraryTitle.objects.count() == 1 and LibraryCopy.objects.count() == 3


# ── Editing (T-LIB-02-6, EC-4) ───────────────────────────────────────────────


def _one_copy(client: Any) -> dict:
    data = _create(client, count=1, numbers=["300"]).json()["data"]
    return client.get(reverse("v1:library-copy", args=[data["copies"][0]["id"]])).json()["data"]


def test_a_number_is_frozen_once_issued_and_a_stale_version_is_409(
    api_as: Any, library_on: Any
) -> None:
    """T-LIB-02-6 / EC-4: the number painted inside a book that has been out
    cannot change; and an edit against a copy another device just moved is
    refused rather than overwriting it."""
    client, _ = api_as(library_on, role="owner")
    copy = _one_copy(client)
    url = reverse("v1:library-copy", args=[copy["id"]])
    renamed = client.patch(
        url, {"accession_number": "301", "version": copy["version"]}, format="json"
    )
    assert renamed.status_code == 200 and renamed.json()["data"]["accession_number"] == "301"
    assert renamed.json()["data"]["events"][0]["reason_code"] == "edited_number"
    LibraryCopy.objects.filter(pk=copy["id"]).update(issued_ever=True)
    version = renamed.json()["data"]["version"]
    frozen = client.patch(url, {"accession_number": "302", "version": version}, format="json")
    assert frozen.status_code == 409
    assert frozen.json()["error"] == {
        **frozen.json()["error"],
        "code": "library_accession_frozen",
        "details": {"copy_id": copy["id"]},
    }
    stale = client.patch(url, {"condition": "fair", "version": version - 1}, format="json")
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "stale_version"


def test_a_barcode_may_not_be_another_copys_number(api_as: Any, library_on: Any) -> None:
    """BR-8: the lookup tries the accession number first, so a barcode equal to
    another copy's number would make that copy unreachable by its label."""
    client, _ = api_as(library_on, role="owner")
    _create(client, count=1, numbers=["555"])
    copy = _one_copy(client)
    url = reverse("v1:library-copy", args=[copy["id"]])
    clash = client.patch(url, {"barcode": "555", "version": copy["version"]}, format="json")
    assert clash.status_code == 409 and clash.json()["error"]["code"] == "library_code_ambiguous"


# ── Status moves (BR-7, FR-12) ───────────────────────────────────────────────


def test_withdraw_rules_and_the_last_copy_archives_the_title(api_as: Any, library_on: Any) -> None:
    """BR-7: refused on loan and on the hold shelf; the last withdrawal archives
    the title (FR-12); staff cannot withdraw at all."""
    owner, _ = api_as(library_on, role="owner")
    data = _create(owner, count=2).json()["data"]
    first, second = (c["id"] for c in data["copies"])
    LibraryCopy.objects.filter(pk=first).update(status=CopyStatus.ON_LOAN)
    url = lambda pk: reverse("v1:library-copy-withdraw", args=[pk])  # noqa: E731
    body = {"reason_code": "worn_out", "note": ""}
    assert owner.post(url(first), body, format="json").json()["error"]["code"] == (
        "library_copy_on_loan"
    )
    staff, member = api_as(library_on, role="staff")
    assert member.role.code == "staff"
    assert staff.post(url(second), body, format="json").status_code == 403
    LibraryCopy.objects.filter(pk=first).update(status=CopyStatus.AVAILABLE)
    copy_status.recount_titles(tenant=library_on)
    assert owner.post(url(first), body, format="json").status_code == 200
    title = LibraryTitle.objects.get(pk=data["id"])
    assert (title.copies_total, title.status) == (1, TitleStatus.ACTIVE)
    archive = owner.post(reverse("v1:library-title-archive", args=[data["id"]]))
    assert archive.status_code == 409
    assert archive.json()["error"]["details"] == {"count": 1}
    assert owner.post(url(second), body, format="json").status_code == 200
    title.refresh_from_db()
    assert (title.copies_total, title.copies_available, title.status) == (0, 0, "archived")


def test_repair_and_back_to_shelf_move_the_caches(api_as: Any, library_on: Any) -> None:
    """A copy in repair is not available to borrow; back on the shelf it is;
    repairing a copy that is not on the shelf is 409 naming its status."""
    client, _ = api_as(library_on, role="staff")
    data = _create(client, count=1).json()["data"]
    pk = data["copies"][0]["id"]
    assert client.post(reverse("v1:library-copy-repair", args=[pk])).status_code == 200
    assert LibraryTitle.objects.get(pk=data["id"]).copies_available == 0
    again = client.post(reverse("v1:library-copy-repair", args=[pk]))
    assert again.json()["error"] == {**again.json()["error"], "details": {"status": "in_repair"}}
    assert client.post(reverse("v1:library-copy-back-to-shelf", args=[pk])).status_code == 200
    assert LibraryTitle.objects.get(pk=data["id"]).copies_available == 1


def test_reference_copies_and_titles_are_not_available_to_borrow(
    api_as: Any, library_on: Any
) -> None:
    """G15: "available" means lendable. A reference copy, or every copy of a
    reference title, is on the shelf and NOT available to borrow."""
    client, _ = api_as(library_on, role="owner")
    data = _create(client, count=2).json()["data"]
    copy = client.get(reverse("v1:library-copy", args=[data["copies"][0]["id"]])).json()["data"]
    client.patch(
        reverse("v1:library-copy", args=[copy["id"]]),
        {"is_reference": True, "version": copy["version"]},
        format="json",
    )
    assert LibraryTitle.objects.get(pk=data["id"]).copies_available == 1
    client.patch(
        reverse("v1:library-title", args=[data["id"]]),
        {"material_type": "reference", "version": data["version"]},
        format="json",
    )
    title = LibraryTitle.objects.get(pk=data["id"])
    assert (title.copies_total, title.copies_available) == (2, 0)


def test_a_fuzzed_history_matches_the_recount(library_on: Any) -> None:
    """T-LIB-02-5 / BR-6: 200 random status moves through `move_copy`, then
    `library_recount` (a set-based re-derivation) corrects nothing."""
    ctx = Ctx.system(library_on)
    title, _numbers, _w = catalogue.create_title(
        ctx=ctx, data={"title": "Fuzz", "copies": {"count": 6}}
    )
    copies = list(LibraryCopy.objects.filter(title=title))
    rng = random.Random(205)
    for _ in range(200):
        copy = rng.choice(copies)
        copy_status.move_copy(
            ctx=ctx,
            copy=copy,
            to_status=rng.choice(CopyStatus.values),
            reason_code="returned",
            on_date=title.created_at.date(),
        )
    title.refresh_from_db()
    cached = (title.copies_total, title.copies_available)
    assert copy_status.recount_titles(tenant=library_on) == 0
    call_command("library_recount")
    title.refresh_from_db()
    assert (title.copies_total, title.copies_available) == cached


# ── Lists, search, lookup ────────────────────────────────────────────────────


def test_search_finds_by_words_isbn_number_and_devanagari(api_as: Any, library_on: Any) -> None:
    """FR-9 / EC-5: one box over title words, a hyphenated ISBN, an exact
    accession number, and a Hindi title typed as written."""
    client, _ = api_as(library_on, role="staff")
    _create(client, count=1, numbers=["4512-A"], isbn="9788173711466")
    _create(client, count=1, title="गोदान", authors="प्रेमचंद")

    def found(q: str) -> list[str]:
        return [r["title"] for r in client.get(reverse(TITLES), {"q": q}).json()["data"]]

    assert found("wings") == ["Wings of Fire"]
    assert found("978-81-7371-146-6") == ["Wings of Fire"]
    assert found("4512-a") == ["Wings of Fire"]
    assert found("गोदान") == ["गोदान"]
    assert found("wi") == ["Wings of Fire"]


def test_copies_sort_numerically_and_unbuilt_filters_are_refused(
    api_as: Any, library_on: Any
) -> None:
    """BR-4 in SQL: `9, 10, 100, R-2, R-10` under C collation, not string
    order; `has_holds` and `-issues_12m` are 400 until their tables exist
    rather than silently doing nothing (PTY-02)."""
    client, _ = api_as(library_on, role="owner")
    _create(client, count=5, numbers=["R-10", "100", "R-2", "9", "10"])
    numbers = [
        r["accession_number"] for r in client.get(reverse("v1:library-copies")).json()["data"]
    ]
    assert numbers == ["9", "10", "100", "R-2", "R-10"]
    assert client.get(reverse(TITLES), {"has_holds": "true"}).status_code == 400
    assert client.get(reverse(TITLES), {"ordering": "-issues_12m"}).status_code == 400


def test_lookup_follows_br8_order(api_as: Any, library_on: Any) -> None:
    """BR-8: a ten-digit code that is both a register number and a valid ISBN-10
    opens the COPY; a code that is only an ISBN lists the titles."""
    client, _ = api_as(library_on, role="staff")
    _create(client, count=1, numbers=["8173711461"], isbn="9788173711466")
    url = reverse("v1:library-lookup")
    assert client.get(url, {"code": "8173711461"}).json()["data"]["kind"] == "copy"
    isbn = client.get(url, {"code": "978-81-7371-146-6"}).json()["data"]
    assert isbn["kind"] == "isbn" and isbn["titles"][0]["title"] == "Wings of Fire"
    assert client.get(url, {"code": "nothing"}).json()["data"] == {"kind": "none"}


# ── Categories, locations, isolation ─────────────────────────────────────────


def test_categories_one_level_merge_and_delete_in_use(api_as: Any, library_on: Any) -> None:
    """FR-8: a parent may not have a parent; merging moves titles then
    soft-deletes; deleting a used category is 409 with the count."""
    client, _ = api_as(library_on, role="owner")
    url = reverse("v1:library-categories")
    top = client.post(url, {"name": "Fiction"}, format="json").json()["data"]
    child = client.post(url, {"name": "Hindi", "parent_id": top["id"]}, format="json").json()[
        "data"
    ]
    deep = client.post(url, {"name": "Deep", "parent_id": child["id"]}, format="json")
    assert deep.status_code == 400 and "parent_id" in deep.json()["error"]["details"]
    dup = client.post(url, {"name": "fiction"}, format="json")
    assert dup.status_code == 400
    novel = client.post(url, {"name": "Novels"}, format="json").json()["data"]
    _create(client, category_id=novel["id"])
    used = client.delete(reverse("v1:library-category", args=[novel["id"]]))
    assert used.status_code == 409
    assert used.json()["error"]["code"] == "library_category_in_use"
    assert used.json()["error"]["details"] == {"count": 1}
    merged = client.post(
        reverse("v1:library-category-merge", args=[novel["id"]]),
        {"into_id": top["id"]},
        format="json",
    )
    assert merged.status_code == 200 and merged.json()["data"]["title_count"] == 1
    assert not LibraryCategory.objects.filter(pk=novel["id"]).exists()


def test_a_location_in_use_cannot_be_deleted(api_as: Any, library_on: Any) -> None:
    """Copies on the shelf are kept somewhere; deleting the place is 409."""
    client, _ = api_as(library_on, role="owner")
    loc = client.post(reverse("v1:library-locations"), {"code": "A-3"}, format="json").json()
    title = _create(client, count=1).json()["data"]
    client.post(
        reverse("v1:library-title-copies", args=[title["id"]]),
        {"count": 2, "location_id": loc["data"]["id"]},
        format="json",
    )
    refused = client.delete(reverse("v1:library-location", args=[loc["data"]["id"]]))
    assert refused.status_code == 409 and refused.json()["error"]["details"] == {"count": 2}


def test_isolation_and_roles(api_as: Any, library_on: Any, other_tenant: Any) -> None:
    """Another tenant's id is 404 (canon §0.11 rule 2); the accountant reads
    the catalogue and writes nothing."""
    owner, _ = api_as(library_on, role="owner")
    data = _create(owner).json()["data"]
    from .conftest import entitle_library

    entitle_library(other_tenant)
    stranger, member = api_as(other_tenant, role="owner")
    assert member.tenant_id == other_tenant.id
    assert stranger.get(reverse("v1:library-title", args=[data["id"]])).status_code == 404
    accountant, who = api_as(library_on, role="accountant")
    assert who.role.code == "accountant"
    assert accountant.get(reverse(TITLES)).status_code == 200
    assert _create(accountant).status_code == 403


# ── B05 QA round 1 lead items ────────────────────────────────────────────────


def test_a_counter_at_its_last_value_refuses_cleanly(library_on: Any) -> None:
    """QA lead item (b): `allocate_counter` at 2,147,483,647 wrote `next + 1`
    into an integer column — a 500. It now refuses with 409 `sequence_exhausted`
    and never hands out the last value (which a typed number may hold)."""
    from apps.common.exceptions import BusinessRuleViolation

    ctx = Ctx.system(library_on)
    sequences.raise_counter(
        ctx=ctx, kind="library_accession", next_number=sequences.MAX_NEXT_NUMBER
    )
    with pytest.raises(BusinessRuleViolation) as caught:
        sequences.allocate_counter(tenant=library_on, kind="library_accession")
    assert caught.value.code == "sequence_exhausted"
    assert caught.value.details == {"kind": "library_accession", "max": sequences.MAX_NEXT_NUMBER}


def test_a_reference_flag_recount_locks_the_title(api_as: Any, library_on: Any) -> None:
    """QA lead item (a): the recount after an `is_reference` change read the
    copies and overwrote the caches with no lock on the title, so a loan or
    return committing in between was lost. The title is now locked FOR UPDATE
    (after the copy, the order `move_copy` uses) before the recount."""
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    client, _ = api_as(library_on, role="owner")
    data = _create(client, count=1).json()["data"]
    copy = client.get(reverse("v1:library-copy", args=[data["copies"][0]["id"]])).json()["data"]
    with CaptureQueriesContext(connection) as queries:
        client.patch(
            reverse("v1:library-copy", args=[copy["id"]]),
            {"is_reference": True, "version": copy["version"]},
            format="json",
        )
    sql = [q["sql"] for q in queries.captured_queries]
    copy_lock = next(
        i for i, s in enumerate(sql) if 'FROM "library_copy"' in s and "FOR UPDATE" in s
    )
    title_lock = next(
        i for i, s in enumerate(sql) if 'FROM "library_title"' in s and "FOR UPDATE" in s
    )
    assert copy_lock < title_lock


def test_the_title_list_says_whether_any_title_exists(api_as: Any, library_on: Any) -> None:
    """Approved designs (12 Oct 2026): an empty catalogue hides its search and
    Filters; a search that found nothing keeps them."""
    client, _ = api_as(library_on, role="owner")
    assert client.get(reverse(TITLES)).json()["meta"]["has_any"] is False
    LibraryTitle.objects.create(tenant=library_on, title="Godaan")
    body = client.get(reverse(TITLES), {"status": "archived"}).json()
    assert body["data"] == [] and body["meta"]["has_any"] is True
