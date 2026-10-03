"""B02 QA round 1 — Part 22 table L must say what the FRD says.

Part 22 §22.1.1 is the closed error registry a client switches on (§22.1: "Switch
on `code`, never on `message`"), and for `library_renewal_refused` and
`library_hold_refused` the client also switches on `details.reason`. Table L,
added by B02, names reason tokens the FRD never defines and states two raise
conditions the FRD contradicts, so the task that implements each code (B05,
B09, B11) would build to the wrong contract if it read Part 22 rather than the
FRD. These tests read both documents and compare them.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
PART_22 = REPO / "docs" / "22-api-specification.md"
FRD = REPO / "docs" / "platform" / "frd" / "library.md"


def _table_l_condition(code: str) -> str:
    """The 'Raised when' cell of `code`'s row in Part 22 table L."""
    for line in PART_22.read_text(encoding="utf-8").splitlines():
        if line.startswith(f"| `{code}` |"):
            return line.split("|")[4]
    raise AssertionError(f"{code} has no row in Part 22")


def _frd_reasons(code: str) -> set[str]:
    """The `details.reason` tokens the FRD's §6 API table lists for `code`."""
    for line in FRD.read_text(encoding="utf-8").splitlines():
        if f"`{code}` (`details.reason`:" in line:
            tail = line.split(f"`{code}` (`details.reason`:", 1)[1].split(")", 1)[0]
            return set(re.findall(r"`([a-z_]+)`", tail))
    raise AssertionError(f"the FRD lists no reasons for {code}")


def test_renewal_refused_row_names_only_the_frd_reasons() -> None:
    """QA-B02-1. LIB-06 §6 defines `details.reason` for a refused renewal as
    `max_renewals | hold_waiting | overdue_blocked | member_blocked | no_gain`.
    Table L lists `overdue`, which is not a reason the server will ever send, and
    omits `overdue_blocked` and `member_blocked`: a client written from Part 22
    switches on a value that never arrives and shows the generic copy for the
    two that do."""
    named = set(re.findall(r"`([a-z_]+)`", _table_l_condition("library_renewal_refused")))
    frd = _frd_reasons("library_renewal_refused")
    assert named <= frd, sorted(named - frd)
    assert {"overdue_blocked", "member_blocked"} <= named


def test_hold_refused_row_names_only_the_frd_reasons() -> None:
    """QA-B02-1. LIB-08 §6 names `already_on_loan` for a member who already has
    the title out; table L calls it `already_borrowed`, a token no service will
    emit."""
    named = set(re.findall(r"`([a-z_]+)`", _table_l_condition("library_hold_refused")))
    frd = _frd_reasons("library_hold_refused")
    assert named <= frd, sorted(named - frd)


def test_code_ambiguous_is_raised_on_create_not_on_lookup() -> None:
    """QA-B02-1. LIB-02 BR-8: a lookup is matched in a fixed order and 'the
    first hit wins'; the 409 is raised when a SECOND record is created whose
    code clashes with an existing one. Table L says the code is raised when 'a
    scanned or typed code matches more than one record', which is the lookup —
    the one place BR-8 says never refuses. B05 built from that row would make
    the counter's scan box answer 409 instead of resolving the accession."""
    condition = _table_l_condition("library_code_ambiguous").lower()
    assert "matches more than one record" not in condition
    assert "creat" in condition


def test_title_has_copies_covers_every_copy_not_withdrawn() -> None:
    """QA-B02-1. LIB-02 FR-12: a title can be archived by hand only when EVERY
    copy is withdrawn — a copy on loan, in repair, lost or missing blocks it as
    much as one on the shelf. Table L says 'a title with copies on the shelf',
    which reads as `available` only and lets a title with books out be archived."""
    condition = _table_l_condition("library_title_has_copies").lower()
    assert "on the shelf" not in condition
    assert "withdrawn" in condition
