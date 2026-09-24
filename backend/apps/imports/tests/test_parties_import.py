"""T-IMP-01-4…12 and T-PTY-10-* — the engine end to end, through the parties kind.

Every test here goes through the HTTP API and the eager job runner, because the
defects this feature can ship are in the seams: a job enqueued but never run, a
commit that writes half a file, a cancel that leaves the upload on disk.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from io import StringIO
from typing import Any

import pytest
from django.core.files.storage import default_storage
from django.core.management import call_command
from django.urls import reverse

from apps.imports.constants import ImportStatus
from apps.imports.models import ImportJob
from apps.imports.tests.helpers import PARTY_HEADER, commit, detail, upload
from apps.ledger.models import LedgerEntry
from apps.parties.models import Party, Tag
from apps.platform_app.models import AuditLog

pytestmark = pytest.mark.django_db

GOOD = "\n".join(
    [
        PARTY_HEADER,
        "Ramesh Traders,9876543210,customer,2300,to_receive,01/04/2026,,Maharashtra,Camp Area",
        "Sharma Wholesale,+91 98123 45678,supplier,15000,to_pay,01/04/2026,27AAPFU0939F1ZV,,Suppliers;Camp Area",
        "Walk-in Anil,,customer,,,,,,",
    ]
)


def _ready(client: Any, text: str, capture: Any) -> dict:
    response = upload(client, "parties", text, capture=capture)
    assert response.status_code == 201, response.content
    return detail(client, response.json()["data"]["id"])


def test_upload_answers_201_before_the_file_is_read(owner: Any) -> None:
    """FR-3 — the request stores and queues; it never parses (no capture = no job run)."""
    response = upload(owner, "parties", GOOD)
    assert response.status_code == 201
    data = response.json()["data"]
    assert data["status"] == ImportStatus.UPLOADED
    assert data["file"]["name"] == "file.csv"
    assert Party.objects.count() == 0


def test_a_clean_file_validates_to_ready_with_a_preview(
    owner: Any, django_capture_on_commit_callbacks: Any
) -> None:
    job = _ready(owner, GOOD, django_capture_on_commit_callbacks)
    assert job["status"] == "ready"
    assert (job["total_rows"], job["valid_rows"], job["error_rows"]) == (3, 3, 0)
    assert job["can_commit"] is True
    first = job["preview_rows"][0]
    assert first["row"] == 2
    assert first["mobile"] == "+919876543210"
    assert first["opening_balance"] == "2300.00"
    # PTY-10 FR-7 — the owner checks these against their own book before committing.
    assert job["totals"]["opening_receivable"] == "2300.00"
    assert job["totals"]["opening_payable"] == "15000.00"
    assert Party.objects.count() == 0  # BR-1: nothing written before commit


def test_commit_creates_parties_and_posts_opening_balances_through_the_ledger(
    owner: Any, tenant: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """T-PTY-10-7/8 — one `opening` entry per non-zero balance, direction and date right,
    and the party's balance equal to it; a blank balance posts nothing."""
    job = _ready(owner, GOOD, django_capture_on_commit_callbacks)
    response = commit(owner, job["id"], django_capture_on_commit_callbacks)
    assert response.status_code == 202, response.content
    done = detail(owner, job["id"])
    assert done["status"] == "completed", done.get("error")
    assert done["summary"]["created_parties"] == 3
    assert done["summary"]["opening_entries"] == 2

    ramesh = Party.objects.get(tenant=tenant, name="Ramesh Traders")
    sharma = Party.objects.get(tenant=tenant, name="Sharma Wholesale")
    anil = Party.objects.get(tenant=tenant, name="Walk-in Anil")
    assert ramesh.mobile == "+919876543210" and sharma.mobile == "+919812345678"
    assert ramesh.balance == Decimal("2300.00")
    assert sharma.balance == Decimal("-15000.00")
    assert anil.balance == Decimal("0.00") and anil.last_activity_at is None
    entry = LedgerEntry.objects.get(party=sharma)
    assert (entry.entry_type, entry.direction, entry.entry_date.isoformat()) == (
        "opening",
        "credit",
        "2026-04-01",
    )
    assert not LedgerEntry.objects.filter(party=anil).exists()
    assert sharma.gstin == "27AAPFU0939F1ZV" and sharma.state_code == "27"
    # Tags created once and reused across rows (PTY-05 rules, T-PTY-10-15).
    assert Tag.objects.filter(tenant=tenant).count() == 2
    assert set(sharma.tags.values_list("name", flat=True)) == {"Suppliers", "Camp Area"}

    out = StringIO()
    call_command("recalc_balances", stdout=out)
    assert "0 found" in out.getvalue()


def test_every_row_the_import_creates_carries_the_job_in_its_audit(
    owner: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """AC-8 / BR-8 — one `import.committed` row, and every party.created names the job."""
    job = _ready(owner, GOOD, django_capture_on_commit_callbacks)
    commit(owner, job["id"], django_capture_on_commit_callbacks)
    committed = AuditLog.objects.get(action="import.committed")
    assert committed.actor_id == owner.member.user_id
    assert committed.actor_type == "user"
    created = AuditLog.objects.filter(action="party.created")
    assert created.count() == 3
    assert all(row.metadata.get("import_job_id") == job["id"] for row in created)
    assert all(row.actor_id == owner.member.user_id for row in created)


def test_committing_twice_creates_no_duplicates(
    owner: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """The sprint's exit criterion — the second press is refused, nothing doubles."""
    job = _ready(owner, GOOD, django_capture_on_commit_callbacks)
    assert commit(owner, job["id"], django_capture_on_commit_callbacks).status_code == 202
    second = commit(owner, job["id"], django_capture_on_commit_callbacks)
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "import_not_ready"
    assert Party.objects.count() == 3
    assert LedgerEntry.objects.filter(entry_type="opening").count() == 2


def test_a_replayed_commit_key_returns_the_first_answer(
    owner: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """Alternate E — a double submit with one Idempotency-Key is the same request."""
    job = _ready(owner, GOOD, django_capture_on_commit_callbacks)
    key = str(uuid.uuid4())
    first = commit(owner, job["id"], django_capture_on_commit_callbacks, HTTP_IDEMPOTENCY_KEY=key)
    again = commit(owner, job["id"], django_capture_on_commit_callbacks, HTTP_IDEMPOTENCY_KEY=key)
    assert first.status_code == again.status_code == 202
    assert Party.objects.count() == 3


def test_re_uploading_the_same_file_reports_every_mobile_as_already_there(
    owner: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """EC-6 / T-PTY-10-9 — the second file cannot create the same people again."""
    job = _ready(owner, GOOD, django_capture_on_commit_callbacks)
    commit(owner, job["id"], django_capture_on_commit_callbacks)
    again = _ready(owner, GOOD, django_capture_on_commit_callbacks)
    codes = {(e["row"], e["code"]) for e in again["errors"]}
    assert (2, "duplicate_existing") in codes and (3, "duplicate_existing") in codes
    assert again["can_commit"] is False
    refused = commit(owner, again["id"], django_capture_on_commit_callbacks)
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "import_has_errors"
    assert refused.json()["error"]["details"]["error_rows"] == again["error_rows"]


def test_errors_carry_row_column_value_code_and_message(
    owner: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """AC-2 — a bad date on row 7 and a repeated mobile on row 12, exactly so."""
    rows = [PARTY_HEADER]
    for n in range(2, 13):
        mobile = f"98765432{n:02d}"
        date = "01/04/2026"
        if n == 7:
            date = "31/02/2026"
        if n == 12:
            mobile = "9876543203"
        rows.append(f"Party {n},{mobile},customer,100,to_receive,{date},,,")
    job = _ready(owner, "\n".join(rows), django_capture_on_commit_callbacks)
    assert job["status"] == "ready" and job["error_rows"] == 2
    errors = {(e["row"], e["column"], e["code"]) for e in job["errors"]}
    assert (7, "opening_date", "invalid_date") in errors
    assert (12, "mobile", "duplicate_in_file") in errors
    repeat = next(e for e in job["errors"] if e["code"] == "duplicate_in_file")
    assert repeat["message"] == "Repeats row 3."
    assert repeat["value"] == "9876543203"
    assert job["can_commit"] is False


def test_a_row_with_three_bad_columns_reports_three_errors(
    owner: Any, django_capture_on_commit_callbacks: Any
) -> None:
    text = PARTY_HEADER + "\nX,123,vendor,abc,,,,,\n"
    job = _ready(owner, text, django_capture_on_commit_callbacks)
    codes = sorted(e["code"] for e in job["errors"])
    assert codes == ["invalid_amount", "invalid_choice", "invalid_mobile", "invalid_name"]
    assert job["error_rows"] == 1


def test_missing_required_column_fails_the_job(
    owner: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """T-IMP-01-5 / Alternate B — an items file uploaded as parties says so."""
    job = _ready(owner, "sku,unit\nA,NOS\n", django_capture_on_commit_callbacks)
    assert job["status"] == "failed"
    assert job["error"]["code"] == "missing_columns"
    assert job["error"]["columns"] == ["name"]


def test_an_empty_file_and_an_oversized_file_fail_with_their_codes(
    owner: Any, django_capture_on_commit_callbacks: Any, monkeypatch: Any
) -> None:
    empty = _ready(owner, PARTY_HEADER + "\n", django_capture_on_commit_callbacks)
    assert empty["error"]["code"] == "empty_file"

    import dataclasses

    from apps.imports import registry

    registry.kinds()  # load the mappers before swapping one
    spec = dataclasses.replace(registry.get("parties"), max_rows=2)
    monkeypatch.setitem(registry._REGISTRY, "parties", spec)
    text = PARTY_HEADER + "\nA One,,,,,,,,\nB Two,,,,,,,,\nC Three,,,,,,,,\n"
    big = _ready(owner, text, django_capture_on_commit_callbacks)
    assert big["error"]["code"] == "too_many_rows"


def test_unknown_columns_warn_once_and_example_rows_warn(
    owner: Any, django_capture_on_commit_callbacks: Any
) -> None:
    text = "name,favourite_colour\nRamesh Traders,blue\n"
    job = _ready(owner, text, django_capture_on_commit_callbacks)
    codes = [w["code"] for w in job["warnings"]]
    assert codes.count("unknown_column") == 1
    assert "example_row" in codes  # "Ramesh Traders" is the template's example
    assert job["error_rows"] == 0


def test_headers_are_matched_through_synonyms(
    owner: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """PTY-10 FR-3's renamed columns, without a mapping screen."""
    text = "Party Name,Phone,Outstanding\nKumar Stores,9876543210,500\n"
    job = _ready(owner, text, django_capture_on_commit_callbacks)
    assert job["status"] == "ready" and job["error_rows"] == 0
    assert job["preview_rows"][0]["opening_balance"] == "500.00"


def test_the_error_file_is_the_original_rows_plus_the_problem(
    owner: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """AC-5 / T-IMP-01-12 — `_row,_column,_problem`, and a formula cell neutralised."""
    text = PARTY_HEADER + "\n=cmd|' /C calc'!A0,123,,,,,,,\nGood Name,,,,,,,,\n"
    job = _ready(owner, text, django_capture_on_commit_callbacks)
    response = owner.get(reverse("v1:import-errors", args=[job["id"]]))
    assert response.status_code == 200
    body = b"".join(response.streaming_content).decode("utf-8")
    assert body.startswith("\ufeff")
    lines = body.lstrip("\ufeff").splitlines()
    assert lines[0].endswith("_row,_column,_problem")
    assert len(lines) == 2  # the header and the one failing row
    assert lines[1].startswith("'=cmd")
    assert ",2,mobile," in lines[1] or ",2," in lines[1]


def test_no_error_file_for_a_clean_job(owner: Any, django_capture_on_commit_callbacks: Any) -> None:
    job = _ready(owner, GOOD, django_capture_on_commit_callbacks)
    response = owner.get(reverse("v1:import-errors", args=[job["id"]]))
    assert response.status_code == 409


def test_a_failure_mid_commit_leaves_nothing_and_can_be_committed_again(
    owner: Any, django_capture_on_commit_callbacks: Any, monkeypatch: Any
) -> None:
    """AC-4 / T-IMP-01-8 — row 3 of 3 blows up, rows 1–2 do not survive."""
    from apps.parties.services import crud

    real = crud.create_party
    calls = {"n": 0}

    def flaky(**kwargs: Any) -> Any:
        calls["n"] += 1
        if calls["n"] == 3:
            raise RuntimeError("disk on fire")
        return real(**kwargs)

    monkeypatch.setattr(crud, "create_party", flaky)
    job = _ready(owner, GOOD, django_capture_on_commit_callbacks)
    commit(owner, job["id"], django_capture_on_commit_callbacks)
    failed = detail(owner, job["id"])
    assert failed["status"] == "failed"
    assert failed["error"]["code"] == "server_error"
    assert failed["error"]["request_id"]
    assert Party.objects.count() == 0
    assert LedgerEntry.objects.count() == 0
    assert failed["can_commit"] is True

    monkeypatch.setattr(crud, "create_party", real)
    assert commit(owner, job["id"], django_capture_on_commit_callbacks).status_code == 202
    assert detail(owner, job["id"])["status"] == "completed"
    assert Party.objects.count() == 3


def test_a_service_refusal_names_the_row(
    owner: Any, tenant: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """The book changed between check and commit: the commit re-reads and refuses whole."""
    job = _ready(owner, GOOD, django_capture_on_commit_callbacks)
    Party.objects.create(tenant=tenant, name="Somebody", mobile="+919812345678")
    commit(owner, job["id"], django_capture_on_commit_callbacks)
    failed = detail(owner, job["id"])
    assert failed["status"] == "failed"
    assert failed["error"]["code"] == "import_has_errors"
    assert Party.objects.filter(tenant=tenant).count() == 1


def test_cancel_deletes_the_file_and_creates_nothing(
    owner: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """AC-7 — `cancelled`, the upload gone from disk, no records."""
    job = _ready(owner, GOOD, django_capture_on_commit_callbacks)
    stored = ImportJob.objects.select_related("file_attachment").get(pk=job["id"]).file_attachment
    assert default_storage.exists(stored.storage_key)
    response = owner.post(reverse("v1:import-cancel", args=[job["id"]]), {}, format="json")
    assert response.status_code == 200
    assert response.json()["data"]["status"] == "cancelled"
    assert not default_storage.exists(stored.storage_key)
    assert Party.objects.count() == 0
    refused = commit(owner, job["id"], django_capture_on_commit_callbacks)
    assert refused.status_code == 409


def test_cancelling_during_import_is_refused(
    owner: Any, django_capture_on_commit_callbacks: Any
) -> None:
    job = _ready(owner, GOOD, django_capture_on_commit_callbacks)
    ImportJob.objects.filter(pk=job["id"]).update(status=ImportStatus.IMPORTING)
    response = owner.post(reverse("v1:import-cancel", args=[job["id"]]), {}, format="json")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "import_in_progress"


def test_a_job_stuck_importing_is_reported_interrupted(
    owner: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """FR-12 / T-IMP-01-9 — a crashed runner never leaves a job spinning."""
    import datetime as dt

    from django.utils import timezone

    job = _ready(owner, GOOD, django_capture_on_commit_callbacks)
    ImportJob.objects.filter(pk=job["id"]).update(
        status=ImportStatus.IMPORTING, updated_at=timezone.now() - dt.timedelta(minutes=45)
    )
    seen = detail(owner, job["id"])
    assert seen["status"] == "failed"
    assert seen["error"]["code"] == "interrupted"
    assert seen["can_commit"] is True


def test_accountant_may_look_but_not_upload_or_commit(
    tenant: Any, api_as: Any, owner: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """T-IMP-01-11 — the accountant has no `write`, so no import."""
    accountant, _ = api_as(tenant, role="accountant")
    assert upload(accountant, "parties", GOOD).status_code == 403
    job = _ready(owner, GOOD, django_capture_on_commit_callbacks)
    seen = detail(accountant, job["id"])
    assert seen["can_commit"] is False
    assert commit(accountant, job["id"]).status_code == 403


def test_a_role_revoked_between_upload_and_commit_is_refused_at_run_time(
    owner: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """BR-10 — permissions are checked again inside the task."""
    from apps.platform_app.models import Role

    job = _ready(owner, GOOD, django_capture_on_commit_callbacks)
    member = owner.member
    # Queue the commit, then downgrade before the runner picks it up.
    with django_capture_on_commit_callbacks(execute=False) as callbacks:
        response = owner.post(reverse("v1:import-commit", args=[job["id"]]), {}, format="json")
    assert response.status_code == 202
    member.role = Role.objects.get(tenant__isnull=True, code="accountant")
    member.save(update_fields=["role"])
    for callback in callbacks:
        callback()
    assert ImportJob.objects.get(pk=job["id"]).status == ImportStatus.FAILED
    assert Party.objects.count() == 0


def test_another_tenants_job_is_not_found(
    owner: Any, other_tenant: Any, api_as: Any, django_capture_on_commit_callbacks: Any
) -> None:
    job = _ready(owner, GOOD, django_capture_on_commit_callbacks)
    stranger, _ = api_as(other_tenant)
    assert stranger.get(reverse("v1:import-detail", args=[job["id"]])).status_code == 404
    assert (
        stranger.post(reverse("v1:import-cancel", args=[job["id"]]), {}, format="json").status_code
        == 404
    )
    assert stranger.get(reverse("v1:import-errors", args=[job["id"]])).status_code == 404


def test_a_hostile_file_name_is_stored_under_the_job_id(owner: Any) -> None:
    """T-IMP-01-12 — the merchant's file name never becomes a path."""
    response = upload(owner, "parties", GOOD, name="../../etc/passwd.csv")
    job = ImportJob.objects.select_related("file_attachment").get(pk=response.json()["data"]["id"])
    assert ".." not in job.file_attachment.storage_key
    assert str(job.id) in job.file_attachment.storage_key
    # Django's upload handler already reduces the name to its last component;
    # it is kept as metadata only, and is never part of the storage path.
    assert job.file_attachment.original_name == "passwd.csv"


def test_file_level_refusals(owner: Any) -> None:
    """§10 — wrong extension, binary content, no kind, no file."""
    wrong = upload(owner, "parties", GOOD, name="parties.xlsx")
    assert wrong.status_code == 400 and wrong.json()["error"]["code"] == "unsupported_file_type"
    binary = upload(owner, "parties", b"PK\x03\x04\x00\x00binary", name="parties.csv")
    assert binary.status_code == 400
    nokind = upload(owner, "nonsense", GOOD)
    assert nokind.status_code == 400 and "kind" in nokind.json()["error"]["details"]
    nofile = owner.post(reverse("v1:import-list"), {"kind": "parties"}, format="multipart")
    assert nofile.status_code == 400


def test_the_history_lists_jobs_newest_first(
    owner: Any, django_capture_on_commit_callbacks: Any
) -> None:
    first = _ready(owner, GOOD, django_capture_on_commit_callbacks)
    second = _ready(owner, "name\nOnly Name\n", django_capture_on_commit_callbacks)
    response = owner.get(reverse("v1:import-list"))
    ids = [row["id"] for row in response.json()["data"]]
    assert ids[:2] == [second["id"], first["id"]]


def test_the_template_has_the_columns_a_comment_line_and_examples(owner: Any) -> None:
    """AC-1 — header, `#` comment, examples, BOM, CRLF — and it re-imports."""
    response = owner.get(reverse("v1:import-template", args=["parties"]))
    assert response.status_code == 200
    assert response["Content-Disposition"].endswith('digikhaato-parties-template.csv"')
    body = response.content.decode("utf-8")
    assert body.startswith("\ufeff")
    lines = body.lstrip("\ufeff").split("\r\n")
    assert lines[0].startswith("name,mobile,type,opening_balance")
    assert lines[1].startswith("# ")
    assert lines[2].startswith("Ramesh Traders,9876543210")


def test_an_unknown_template_is_404(owner: Any) -> None:
    assert owner.get(reverse("v1:import-template", args=["nonsense"])).status_code == 404


def test_the_uploader_is_notified_when_the_import_finishes(
    owner: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """AC-6 — the in-app notification, with the job page as its route."""
    from apps.notifications.models import Notification

    job = _ready(owner, GOOD, django_capture_on_commit_callbacks)
    commit(owner, job["id"], django_capture_on_commit_callbacks)
    note = Notification.objects.get(type="import_done")
    assert note.user_id == owner.member.user_id
    assert note.data["route"] == f"/imports/{job['id']}"
