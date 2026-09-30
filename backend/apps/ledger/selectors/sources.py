"""LED-10 FR-5 — `resolve_sources(entries)`: which document each khata line came from.

The statement and the timeline show a document row as its number, linked back
to the document ("INV/26-27/0042", "RCT/26-27/0017"). The ledger cannot look
those numbers up itself: Part 20 §20.1.4 lets `sales`, `payments` and
`expenses` import `ledger`, never the other way round. So each document app
REGISTERS a resolver for its `source_type` in its `AppConfig.ready()` — the
same registry-in-`ready()` port the settle handlers use — and this module calls
whatever is registered, batched per type (one query per source type per page,
never one per row).

A resolver takes a set of ids and returns `{id: SourceSummary}` for the ones
it found. An id it cannot find is simply absent, and the row says so ("Document
not found", LED-10 §9) rather than inventing a number.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable, Iterable
from typing import Any, TypedDict


class SourceSummary(TypedDict, total=False):
    """What a row needs to name and link its document. Money never travels here."""

    number: str | None
    status: str | None
    #: The document kind the badge shows — `invoice`, `bill_of_supply`,
    #: `credit_note`, `payment_in`, `payment_out`, `expense`, `purchase_bill`.
    kind: str | None
    #: A4b — `True` on the lines of a deposit ADJUSTMENT, absent otherwise (payments'
    #: resolver). Passed through only when present, so no other row's payload changes.
    adjustment: bool


Resolver = Callable[[set[str]], dict[str, SourceSummary]]

_RESOLVERS: dict[str, Resolver] = {}


def register_source_resolver(source_type: str, resolver: Resolver) -> None:
    """Called once per app at start-up; the last registration for a type wins."""
    _RESOLVERS[source_type] = resolver


def resolve_sources(entries: Iterable[Any]) -> dict[str, SourceSummary]:
    """`{source_id: summary}` for every document-sourced entry in `entries`."""
    wanted: dict[str, set[str]] = defaultdict(set)
    for entry in entries:
        source_type = getattr(entry, "source_type", None)
        source_id = getattr(entry, "source_id", None)
        if source_id is None or source_type not in _RESOLVERS:
            continue
        wanted[source_type].add(str(source_id))
    found: dict[str, SourceSummary] = {}
    for source_type, ids in wanted.items():
        for source_id, summary in _RESOLVERS[source_type](ids).items():
            found[source_id] = summary
    return found
