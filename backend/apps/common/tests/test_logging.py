"""Structured logging and request-id propagation (task S0-37, Part 30 §30.2)."""

from __future__ import annotations

import json
import logging
from typing import Any

import pytest
from django.urls import reverse

from apps.common.logging import JsonFormatter, RequestIdFilter, build_logging_config

MOBILE_PATTERN = r"\+?\d{10,13}"


def _format(record: logging.LogRecord) -> dict:
    RequestIdFilter().filter(record)
    return json.loads(JsonFormatter().format(record))


def _record(msg: str, **extra: Any) -> logging.LogRecord:
    record = logging.LogRecord("ub.test", logging.INFO, __file__, 1, msg, (), None)
    for key, value in extra.items():
        setattr(record, key, value)
    return record


def test_a_line_is_one_json_object_with_the_correlation_keys() -> None:
    payload = _format(_record("party.created", request_id="req-9", tenant_id="t-1"))
    assert payload["event"] == "party.created"
    assert payload["request_id"] == "req-9"
    assert payload["tenant_id"] == "t-1"
    assert payload["level"] == "INFO"
    assert payload["logger"] == "ub.test"


def test_extra_keys_travel_as_fields_not_as_message_interpolation() -> None:
    """Part 26 §26.9 R9.2: structured `extra`, never an f-string of data."""
    payload = _format(_record("job.succeeded", job_type="platform.purge_jobs", duration_ms=12))
    assert payload["job_type"] == "platform.purge_jobs"
    assert payload["duration_ms"] == 12


def test_the_request_id_defaults_to_empty_rather_than_missing() -> None:
    assert _format(_record("x"))["request_id"] == ""


def test_the_logging_config_names_the_ub_logger_tree() -> None:
    config = build_logging_config(level="INFO", fmt="json")
    assert "ub" in config["loggers"]
    assert config["loggers"]["ub"]["level"] == "INFO"
    assert config["filters"]["request_id"]["()"] == "apps.common.logging.RequestIdFilter"


def test_a_file_handler_is_added_only_when_a_log_dir_is_given(tmp_path: Any) -> None:
    assert "file" not in build_logging_config()["handlers"]
    config = build_logging_config(log_dir=str(tmp_path))
    assert config["handlers"]["file"]["filename"] == f"{tmp_path}/digikhaato.log"


@pytest.mark.django_db
def test_no_mobile_number_reaches_the_access_log(tenant: Any, api_as: Any, caplog: Any) -> None:
    """Part 26 §26.9 R9.3: never log PII. The access line carries no body."""
    import re

    from tests.factories.parties import PartyFactory

    PartyFactory(tenant=tenant, mobile="+919812345678")
    client, _member = api_as(tenant)

    with caplog.at_level(logging.INFO, logger="ub.access"):
        client.get(reverse("v1:party-list"))

    for record in caplog.records:
        rendered = json.dumps(
            {k: str(v) for k, v in record.__dict__.items() if not k.startswith("_")}
        )
        assert not re.search(MOBILE_PATTERN, rendered), rendered


def test_the_console_sms_backend_masks_the_number(caplog: Any) -> None:
    import re

    from apps.common.integrations.sms.console import ConsoleSmsBackend

    with caplog.at_level(logging.INFO, logger="ub.notifications"):
        result = ConsoleSmsBackend().send(to="+919812345678", body="hello", sender_id="UDHAAR")

    assert result.status == "sent"
    for record in caplog.records:
        assert not re.search(MOBILE_PATTERN, json.dumps(record.__dict__, default=str))
