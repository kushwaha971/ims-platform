"""The sprint's performance exit criterion, with a generated file.

"A 1,000-row party import with 40 deliberate errors validates in ≤ 30 s and
commits idempotently" (Part 32 §32.13.1). Measured through the real upload and
the real job runner, because the budget is about what a merchant waits for,
not about one function.
"""

from __future__ import annotations

import time
import tracemalloc
from typing import Any

import pytest

from apps.imports.models import ImportJob
from apps.imports.services.engine import run_validation
from apps.imports.tests.helpers import PARTY_HEADER, commit, detail, upload
from apps.parties.models import Party

pytestmark = pytest.mark.django_db

#: The four kinds of deliberate mistake, ten of each.
BAD_EVERY = 25


def party_file(rows: int, *, bad_every: int | None = BAD_EVERY) -> tuple[str, int]:
    """`rows` parties; every `bad_every`-th row carries one deliberate error."""
    lines = [PARTY_HEADER]
    errors = 0
    for n in range(1, rows + 1):
        mobile = f"9{n:09d}"
        amount = f"{(n * 37) % 5000}.50"
        date = "01/04/2026"
        name = f"Party {n:05d}"
        if bad_every and n % bad_every == 0:
            errors += 1
            kind = (n // bad_every) % 4
            if kind == 0:
                mobile = "12345"  # invalid_mobile
            elif kind == 1:
                date = "31/02/2026"  # invalid_date
            elif kind == 2:
                mobile = "9000000001"  # duplicate_in_file (row 2 holds it)
            else:
                amount = "abc"  # invalid_amount
        lines.append(
            f"{name},{mobile},customer,{amount},to_receive,{date},,Karnataka,Route {n % 7}"
        )
    return "\n".join(lines), errors


def test_a_thousand_party_file_with_forty_errors_validates_within_thirty_seconds(
    owner: Any, django_capture_on_commit_callbacks: Any
) -> None:
    text, planted = party_file(1000)
    assert planted == 40
    response = upload(owner, "parties", text)
    job_id = response.json()["data"]["id"]
    started = time.monotonic()
    run_validation(job_id)
    elapsed = time.monotonic() - started
    job = ImportJob.objects.get(pk=job_id)
    assert job.status == "ready"
    assert job.total_rows == 1000
    assert job.error_rows == 40
    assert elapsed <= 30, f"validation took {elapsed:.1f}s"


def test_the_corrected_thousand_rows_commit_once_and_only_once(
    owner: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """…and commits idempotently: the second press creates nothing."""
    text, _ = party_file(1000, bad_every=None)
    response = upload(owner, "parties", text, capture=django_capture_on_commit_callbacks)
    job_id = response.json()["data"]["id"]
    assert detail(owner, job_id)["error_rows"] == 0
    assert commit(owner, job_id, django_capture_on_commit_callbacks).status_code == 202
    assert commit(owner, job_id, django_capture_on_commit_callbacks).status_code == 409
    assert detail(owner, job_id)["status"] == "completed"
    assert Party.objects.count() == 1000


def test_validation_memory_is_bounded_by_the_row_not_the_file(owner: Any) -> None:
    """T-IMP-01-15 — the parse streams; 10,000 rows stay well under 128 MB."""
    text, _ = party_file(10_000, bad_every=50)
    response = upload(owner, "parties", text)
    job_id = response.json()["data"]["id"]
    tracemalloc.start()
    try:
        run_validation(job_id)
        _current, peak = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()
    assert ImportJob.objects.get(pk=job_id).total_rows == 10_000
    assert peak < 128 * 1024 * 1024, f"peak {peak / 1024 / 1024:.1f} MB"
