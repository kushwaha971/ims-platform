"""The PII sweep (Part 12 §12.8, Part 27 §27.14, TSK-CHS-OBS-06).

"No mobile number, party name, note or amount appears in any … log line" and
no password, token or JWT either. The older check in `test_logging.py` asserted
this through `caplog`, which sits on the ROOT logger — and the `ub` tree does
not propagate, so it saw no records at all and passed on an empty list.

This one attaches a handler built exactly as `build_logging_config` builds the
real ones (same formatter, same filter chain) to every configured logger, runs
representative flows end to end — sign-up with a mobile, a wrong and a right
password, a reset, a party with a mobile, a ledger entry with a note, an
invoice, a share link opened by the customer and revoked, an unhandled error
whose message quotes a mobile — and asserts on the TEXT a log file would hold.
It also asserts that records were captured, so it cannot pass vacuously.

The sweep found one real leak: the access log wrote `GET
/api/v1/public/d/<token>` on every view of a shared bill — the credential the
customer holds, in a file every operator reads.
"""

from __future__ import annotations

import io
import logging
import re
import uuid
from typing import Any

import pytest
from django.urls import reverse
from django.utils.module_loading import import_string

from apps.common.logging import build_logging_config, redact_pii
from apps.sales.tests.conftest import draft, invoice_url, issue, line
from tests.fixtures import register_via_api, reset_token_for

pytestmark = pytest.mark.django_db

OWNER_MOBILE = "+919812345678"
PARTY_MOBILE = "+919876543210"
PASSWORD = "Kirana1234"
NEW_PASSWORD = "Almirah9876"
PARTY_NAME = "Zorawar Pawnbrokers"
NOTE = "Paid for the saffron consignment"
AMOUNT = "7431.29"


@pytest.fixture
def log_text() -> Any:
    """Everything a production handler would have written, as one string."""
    config = build_logging_config(level="DEBUG", fmt="json")
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(import_string(config["formatters"]["json"]["()"])())
    for name in config["handlers"]["console"]["filters"]:
        handler.addFilter(import_string(config["filters"][name]["()"])())
    handler.setLevel(logging.DEBUG)
    names = [*config["loggers"], ""]
    saved = {}
    for name in names:
        target = logging.getLogger(name)
        saved[name] = target.level
        target.setLevel(logging.DEBUG)
        target.addHandler(handler)
    records: list[logging.LogRecord] = []

    class _Count(logging.Filter):
        def filter(self, record: logging.LogRecord) -> bool:
            records.append(record)
            return True

    handler.addFilter(_Count())
    try:
        yield lambda: (stream.getvalue(), records)
    finally:
        for name in names:
            target = logging.getLogger(name)
            target.removeHandler(handler)
            target.setLevel(saved[name])


def test_representative_flows_leave_no_pii_or_secret_in_the_logs(
    log_text: Any,
    auth_client: Any,
    anonymous_client: Any,
    shop: Any,
    owner: Any,
    make_item: Any,
    make_party: Any,
) -> None:
    # Sign-up with a mobile, a wrong password, a right one, a reset.
    register_via_api(auth_client, "sweep@example.com", PASSWORD, mobile=OWNER_MOBILE)
    anonymous_client.post(
        reverse("v1:auth-login"),
        {"email": "sweep@example.com", "password": "Wrong-9999"},
        format="json",
    )
    anonymous_client.post(
        reverse("v1:auth-login"),
        {"email": "sweep@example.com", "password": PASSWORD},
        format="json",
    )
    anonymous_client.post(
        reverse("v1:auth-password-reset-request"), {"email": "sweep@example.com"}, format="json"
    )
    reset = reset_token_for("sweep@example.com")
    anonymous_client.post(
        reverse("v1:auth-password-reset-confirm"),
        {"token": reset, "new_password": NEW_PASSWORD},
        format="json",
    )

    # A party with a mobile, searched for by it; a ledger entry with a note.
    created = owner.post(
        reverse("v1:party-list"), {"name": PARTY_NAME, "mobile": PARTY_MOBILE}, format="json"
    )
    assert created.status_code == 201, created.json()
    party_id = created.json()["data"]["id"]
    owner.get(reverse("v1:party-list"), {"q": PARTY_MOBILE[-10:]})
    entry = owner.post(
        reverse("v1:ledger-entry-list"),
        {
            "party_id": party_id,
            "direction": "debit",
            "amount": AMOUNT,
            "entry_date": __import__("datetime").date.today().isoformat(),
            "note": NOTE,
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    assert entry.status_code == 201, entry.json()

    # An invoice, shared, opened by the customer, revoked, opened again.
    doc = draft(owner, party_id=party_id, lines=[line(make_item())]).json()["data"]
    issued = issue(owner, doc["id"]).json()["data"]
    link = owner.post(invoice_url(issued["id"], "share-links"), {}, format="json").json()["data"]
    token = link["url"].rsplit("/d/", 1)[1]
    assert anonymous_client.get(reverse("v1:public-document", args=[token])).status_code == 200
    owner.post(invoice_url(issued["id"], "share-links/revoke"), {}, format="json")
    assert anonymous_client.get(reverse("v1:public-document", args=[token])).status_code == 404

    # A careless log line of the kind the filter exists for.
    logging.getLogger("ub.test").warning(
        "customer %s called", PARTY_MOBILE, extra={"password": PASSWORD, "to": PARTY_MOBILE}
    )
    try:
        raise ValueError(f"no such mobile {PARTY_MOBILE}")
    except ValueError:
        logging.getLogger("ub.test").exception("lookup failed")

    text, records = log_text()
    assert len(records) >= 20, f"only {len(records)} records captured — not measuring anything"
    assert any(r.getMessage() == "http.request" for r in records)

    leaks = {
        "owner mobile": OWNER_MOBILE[-10:],
        "party mobile": PARTY_MOBILE[-10:],
        "password": PASSWORD,
        "new password": NEW_PASSWORD,
        "reset token": reset,
        "share token": token,
        "party name": PARTY_NAME,
        "note": NOTE,
        "amount": AMOUNT,
        "email": "sweep@example.com",
    }
    found = {label: needle for label, needle in leaks.items() if needle in text}
    assert not found, found
    assert not re.search(r"eyJ[A-Za-z0-9_-]{6,}\.", text), "a JWT reached the log"
    # And the scrubbing is what made it pass, not an absence of lines: the
    # customer's view WAS logged, and the careless line WAS written.
    assert "/public/d/[redacted]" in text
    assert "customer [mobile] called" in text


def test_the_redacting_filter_is_on_every_configured_handler() -> None:
    """A handler without it is a file a careless `extra` can write a mobile into."""
    for fmt, log_dir in (("json", None), ("json", "/tmp"), ("console", None)):
        config = build_logging_config(fmt=fmt, log_dir=log_dir)
        for name, handler in config["handlers"].items():
            assert "pii" in handler["filters"], (fmt, name)
            assert "secret_paths" in handler["filters"], (fmt, name)


@pytest.mark.parametrize(
    ("raw", "clean"),
    [
        ("to +919812345678", "to [mobile]"),
        ("to 9812345678 now", "to [mobile] now"),
        ("GET /api/v1/public/d/Ab_12-xY 200", "GET /api/v1/public/d/[redacted] 200"),
        ("GET /d/Ab_12-xY", "GET /d/[redacted]"),
        ("mail ramesh@shop.in", "mail [email]"),
        ("bearer eyJhbGciOi.eyJzdWIiOiI.sig_abcdef", "bearer [jwt]"),
        # Ids, counts and dates are what log lines are made of — they survive.
        ("job 3fa85f64-5717-4562-b3fc-2c963f66afa6 took 1234 ms", None),
        ("on 2026-09-28 moved 12", None),
    ],
)
def test_the_patterns_mask_pii_and_keep_ids(raw: str, clean: str | None) -> None:
    assert redact_pii(raw) == (clean if clean is not None else raw)
