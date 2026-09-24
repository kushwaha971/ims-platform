"""L5 -- migration 0009 brings legacy `platform_user.mobile` spellings to E.164.

Defect prevented: a mobile stored before NEW-2's normalisation (a bare
`9845678901`) is not the E.164 spelling the "already used by another login"
check and `uq_user_mobile_notnull` compare, so a second login could be given
the same number. The migration must fix those rows, and where fixing would
collide with another user's number it must leave every row involved untouched
and report it -- never delete, merge or choose a winner.
"""

from __future__ import annotations

import importlib

import pytest

from apps.platform_app.models import User

migration = importlib.import_module("apps.platform_app.migrations.0009_normalise_user_mobiles")

pytestmark = pytest.mark.django_db


def _user(email: str, mobile: str | None) -> User:
    return User.objects.create_user(email=email, password=None, full_name=email, mobile=mobile)


def _mobile(user: User) -> str | None:
    return User.objects.values_list("mobile", flat=True).get(pk=user.pk)


def test_rewrites_legacy_spellings_to_e164() -> None:
    """Bare, spaced and country-coded spellings all become `+91XXXXXXXXXX`."""
    bare = _user("bare@x.in", "9845678901")
    spaced = _user("spaced@x.in", "91 98456 00000")
    dashed = _user("dashed@x.in", "+91-98456-11111")
    lines: list[str] = []

    result = migration.normalise_user_mobiles(User, report=lines.append)

    assert _mobile(bare) == "+919845678901"
    assert _mobile(spaced) == "+919845600000"
    assert _mobile(dashed) == "+919845611111"
    assert sorted(result["updated"]) == sorted([bare.pk, spaced.pk, dashed.pk])
    assert result["collisions"] == []
    assert lines == []


def test_leaves_already_normalised_and_empty_rows_alone() -> None:
    """E.164 and NULL rows are not touched and not reported."""
    good = _user("good@x.in", "+919845678901")
    none = _user("none@x.in", None)
    lines: list[str] = []

    result = migration.normalise_user_mobiles(User, report=lines.append)

    assert _mobile(good) == "+919845678901"
    assert _mobile(none) is None
    assert result == {"updated": [], "collisions": [], "unparseable": []}
    assert lines == []


def test_collision_with_an_existing_e164_holder_leaves_the_legacy_row_unchanged() -> None:
    """The holder keeps its number; the legacy row is reported, not rewritten or deleted."""
    holder = _user("holder@x.in", "+919845678901")
    legacy = _user("legacy@x.in", "9845678901")
    lines: list[str] = []

    result = migration.normalise_user_mobiles(User, report=lines.append)

    assert _mobile(holder) == "+919845678901"
    assert _mobile(legacy) == "9845678901"
    assert result["collisions"] == [legacy.pk]
    assert result["updated"] == []
    assert User.objects.count() == 2
    assert len(lines) == 1 and str(legacy.pk) in lines[0] and str(holder.pk) in lines[0]
    # The report masks the number (Part 26 R9.3).
    assert "9845678901" not in lines[0]


def test_two_legacy_spellings_of_one_number_are_both_left_unchanged() -> None:
    """No winner is picked when two old spellings would land on the same E.164."""
    a = _user("a@x.in", "9845678901")
    b = _user("b@x.in", "919845678901")
    other = _user("other@x.in", "9000000001")
    lines: list[str] = []

    result = migration.normalise_user_mobiles(User, report=lines.append)

    assert _mobile(a) == "9845678901"
    assert _mobile(b) == "919845678901"
    assert _mobile(other) == "+919000000001"
    assert sorted(result["collisions"]) == sorted([a.pk, b.pk])
    assert result["updated"] == [other.pk]
    assert len(lines) == 2


def test_unparseable_value_is_left_and_reported() -> None:
    """A value the serializers would refuse is not guessed at."""
    odd = _user("odd@x.in", "12345")
    lines: list[str] = []

    result = migration.normalise_user_mobiles(User, report=lines.append)

    assert _mobile(odd) == "12345"
    assert result["unparseable"] == [odd.pk]
    assert len(lines) == 1 and str(odd.pk) in lines[0]


def test_after_the_migration_the_new2_check_sees_the_legacy_number() -> None:
    """The point of L5: the taken-mobile lookup now matches the rewritten row."""
    _user("legacy@x.in", "98456 78901")

    migration.normalise_user_mobiles(User, report=lambda _line: None)

    assert User.objects.filter(mobile="+919845678901").exists()


def test_reverse_is_a_noop() -> None:
    """Reversible without pretending to restore spellings it no longer knows."""
    op = migration.Migration.operations[0]
    assert op.reversible
    assert op.reverse_code is not None
