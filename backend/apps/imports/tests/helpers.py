"""Request helpers for the import suites (fixtures live in `conftest.py`)."""

from __future__ import annotations

from typing import Any

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse


def csv_file(
    text: str, name: str = "parties.csv", *, encoding: str = "utf-8"
) -> SimpleUploadedFile:
    return SimpleUploadedFile(name, text.encode(encoding), content_type="text/csv")


def upload(
    client: Any, kind: str, text: str | bytes, name: str = "file.csv", capture: Any = None
) -> Any:
    data = text if isinstance(text, bytes) else text.encode("utf-8")
    body = {"kind": kind, "file": SimpleUploadedFile(name, data, content_type="text/csv")}
    if capture is None:
        return client.post(reverse("v1:import-list"), body, format="multipart")
    with capture(execute=True):
        return client.post(reverse("v1:import-list"), body, format="multipart")


def detail(client: Any, job_id: str) -> dict:
    response = client.get(reverse("v1:import-detail", args=[job_id]))
    assert response.status_code == 200, response.content
    return response.json()["data"]


def commit(client: Any, job_id: str, capture: Any = None, **headers: Any) -> Any:
    url = reverse("v1:import-commit", args=[job_id])
    if capture is None:
        return client.post(url, {}, format="json", **headers)
    with capture(execute=True):
        return client.post(url, {}, format="json", **headers)


PARTY_HEADER = "name,mobile,type,opening_balance,opening_type,opening_date,gstin,state,tags"
