"""PTY-06 — the credit limit, and the one rule that enforces it.

A credit limit turns an implicit decision into an explicit one: the shopkeeper
who keeps giving udhaar to a good customer until the amount is unrecoverable is
the single largest cause of working-capital failure in Indian retail, and the
paper khata never says "stop". This module is where "stop" is decided.

── What this module does NOT do yet, and why ──────────────────────────────────

FR-5 lists four operations the check guards: a manual "You gave" entry, issuing
a sales invoice on credit, converting an estimate, and correcting an entry
upward. None of them exist. `apps/ledger` and `apps/sales` have models.py files
containing a docstring and nothing else — no `ledger_entry` table, no
`sales_document` table, no endpoint that grants credit.

So `check_credit` is complete and `enforce_credit` is not written at all. The
first is a pure function of a party, an amount and a mode, and it is exercised
by the pre-flight endpoint and by thirty tests; the second is three lines that
belong in the write path they guard, next to the row lock that makes them safe
(BR-2), and writing them here against no caller would be guessing at an
interface. LED-01 adds them, and the tests that hold them absent are what has to
be deleted to let them in.

The same goes for the override (FR-7), the dialog (FR-9) and "Ask owner"
(FR-11): all three are about a write that can be refused, and there is no such
write. What IS here is everything a merchant can use today — the exposure, the
usage bar, the over-limit list and the limit itself.

── The one genuinely subtle rule ──────────────────────────────────────────────

Exposure is `max(balance, 0)`, and the floor is BR-3 rather than defensiveness.
A party who has paid an advance has a negative balance; that money is THEIRS,
not extra credit. Without the floor a customer ₹2,000 in credit against a
₹50,000 limit would have ₹52,000 of headroom — the product would be lending
them their own deposit back and calling it capacity.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from apps.parties.models import Party

#: FR-2. `warn` is the default because a merchant who has not thought about
#: this yet should be told, not stopped: a rule nobody chose should never cost
#: somebody a sale.
CREDIT_MODE_OFF = "off"
CREDIT_MODE_WARN = "warn"
CREDIT_MODE_BLOCK = "block"
CREDIT_MODES: tuple[str, ...] = (CREDIT_MODE_OFF, CREDIT_MODE_WARN, CREDIT_MODE_BLOCK)
DEFAULT_CREDIT_MODE = CREDIT_MODE_WARN

#: Part 21 §21.3.1's well-known key. Already in `WELL_KNOWN_SETTING_KEYS` and
#: already seeded at tenant creation as `{"mode": "warn"}` — this is the first
#: code that reads it.
CREDIT_MODE_SETTING_KEY = "ledger.credit_limit_mode"

#: §10's ceiling — ₹99,99,99,999.99. A limit above this is a typo rather than a
#: business decision, and the column is `numeric(14,2)`.
MAX_CREDIT_LIMIT = Decimal("99999999.99")

#: FR-12. "Near" starts at four fifths of the limit, which is far enough from
#: the edge that a merchant can still act and close enough that the list is
#: short.
NEAR_LIMIT_RATIO = Decimal("0.8")

#: BR-11. A percentage is for a bar, and a bar past ten times its own width says
#: nothing more than one past three times it. Clamped for DISPLAY only — the
#: rupee figures beside it are never clamped, because those are the facts.
MAX_USAGE_PCT = 999

ZERO = Decimal("0.00")


def credit_mode(tenant: Any) -> str:
    """The tenant's enforcement mode, or the default.

    Read here rather than cached on the tenant object, because this is called
    once per check and a check is one indexed read on a table with one row per
    tenant per key. A cache would be a second thing to invalidate when PLT-06
    lets somebody change the mode.

    An unrecognised value falls back to the default rather than raising. The
    setting is a JSON blob that a future migration, an import or a support
    script could put anything into, and a book that stops taking bills because
    somebody typed `"Warn"` would be a worse outcome than a book that warns.
    """
    from apps.platform_app.models import TenantSetting

    row = TenantSetting.objects.filter(tenant=tenant, key=CREDIT_MODE_SETTING_KEY).first()
    value = row.value if row is not None else None
    mode = value.get("mode") if isinstance(value, dict) else value
    return mode if mode in CREDIT_MODES else DEFAULT_CREDIT_MODE


def credit_exposure(party: Party) -> Decimal:
    """What this party currently owes, floored at zero (FR-4, BR-3).

    ── Why `open_credit_documents` is NOT added ───────────────────────────────
    FR-4 states the full formula as `max(balance, 0) + open_credit_documents`
    and then says, in the same paragraph, that at MVP the second term is zero.
    That is not a simplification: issuing an invoice already posts a ledger
    debit (Part 22 §22.14), so `balance` ALREADY CONTAINS those amounts, and
    adding them again would count every unpaid invoice twice — a customer with
    one ₹10,000 invoice would read as ₹20,000 of exposure and be blocked at half
    their limit.

    The expanded formula earns its place in the spec because draft invoices and
    Phase-2 sales orders post nothing and will have to be added. Drafts are
    excluded at MVP by BR-4, which is also why the check runs at ISSUE rather
    than at draft save.
    """
    return max(party.balance, ZERO)


def usage_pct(exposure: Decimal, limit: Decimal | None) -> int | None:
    """`round(exposure / limit × 100)`, half-up, clamped for display (BR-11).

    `None` when there is no limit, because a percentage of nothing is not zero —
    a party with no limit is not at 0% of it, they are outside the question.

    A limit of ZERO is a real limit meaning "no udhaar at all" (BR-1), and
    dividing by it is not a thing to do. Anything owed against it is reported as
    the clamp, which is what the bar draws and what the caption then explains in
    rupees: "₹4,200 over the ₹0 limit".
    """
    if limit is None:
        return None
    if limit == ZERO:
        return MAX_USAGE_PCT if exposure > ZERO else 0
    raw = (exposure / limit * Decimal(100)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return int(max(min(raw, Decimal(MAX_USAGE_PCT)), Decimal(0)))


def credit_snapshot(party: Party, *, mode: str) -> dict | None:
    """The block the khata page's bar and the detail payload read.

    `None` when the party has no limit, and that is a statement rather than an
    omission: there is no bar to draw and no percentage to report, and a client
    asking "is there a limit" should be asking about the block's presence rather
    than picking through its fields for nulls.

    `mode` is carried INSIDE the block so the client can hide the bar when the
    tenant has switched checks off (FR-10) without a second request to find out.
    The limit itself is still returned in that case, and still editable, because
    it is data rather than behaviour (§9, "Disabled").
    """
    if party.credit_limit is None:
        return None
    exposure = credit_exposure(party)
    limit = party.credit_limit
    return {
        "limit": limit,
        "days": party.credit_days,
        "exposure": exposure,
        # Floored, for the same reason exposure is: "available" is money that
        # can still be lent, and a party ₹500 past a ₹2,000 limit can be lent
        # nothing, not −₹500.
        "available": max(limit - exposure, ZERO),
        "over_by": max(exposure - limit, ZERO),
        "usage_pct": usage_pct(exposure, limit),
        "mode": mode,
        "status": limit_status(exposure, limit),
    }


def limit_status(exposure: Decimal, limit: Decimal | None) -> str:
    """`over`, `near` or `ok` — the same three words the list filter uses.

    Computed here rather than in the filter so that a row in the over-limit list
    and the bar on that party's own page can never disagree about which of the
    three they are describing.
    """
    if limit is None:
        return "ok"
    if exposure > limit:
        return "over"
    if limit > ZERO and exposure >= (limit * NEAR_LIMIT_RATIO):
        return "near"
    return "ok"


def check_credit(*, party: Party, amount: Decimal, mode: str) -> dict:
    """Would this amount put the party over their limit, and what follows (FR-6).

    Returns `{status, mode, limit, exposure_before, exposure_after,
    available_before, over_by}` — `status` one of `ok`, `warn`, `block`.

    ── The comparison is strictly greater than, and EC-12 is why ──────────────
    A bill that lands EXACTLY on the limit is allowed. `>=` would make a ₹50,000
    limit mean ₹49,999.99, which is not what anybody typing a round number
    means, and the merchant would have no way to spend the last rupee of a
    limit they set.

    ── `status` is not a decision, it is a description ────────────────────────
    This function refuses nothing. It says what the situation is; the write path
    that calls it decides, inside its own transaction and after locking the row
    (BR-2), because only there is the balance current. The client's pre-flight
    calls this same function and is advisory only — a stale pre-flight cannot
    bypass anything, because it never had the power to allow anything.
    """
    limit = party.credit_limit
    before = credit_exposure(party)
    after = before + amount

    if mode == CREDIT_MODE_OFF or limit is None:
        status = "ok"
    elif after > limit:
        status = CREDIT_MODE_BLOCK if mode == CREDIT_MODE_BLOCK else CREDIT_MODE_WARN
    else:
        status = "ok"

    return {
        "status": status,
        "mode": mode,
        "limit": limit,
        "exposure_before": before,
        "exposure_after": after,
        "available_before": None if limit is None else max(limit - before, ZERO),
        "over_by": ZERO if limit is None else max(after - limit, ZERO),
    }


#: BR-8, and the one place in this product where a ROLE is checked rather than a
#: codename. It is recorded here so the pattern is not copied elsewhere.
#:
#: Overriding a financial control is a governance decision rather than a task,
#: and `permissions_override` exists so a tenant can hand a staff member any
#: codename they like. A tenant that grants `parties.party.write` to the counter
#: — which is the ordinary thing to do, because staff add customers — must not
#: thereby hand them the ability to lend past the limit the owner set.
OVERRIDE_ROLES: tuple[str, ...] = ("owner", "admin")


def may_override(*, tenant: Any, user: Any) -> bool:
    """Is this actor allowed to go over a limit (FR-7, BR-8)?

    Returns a flag rather than raising, because the only caller today is a READ:
    the pre-flight tells the client which buttons to draw. The write path that
    refuses is LED-01's, and it will raise there — the check has to run inside
    the transaction that writes, not in the one that answered a question about
    it a moment earlier.
    """
    from apps.platform_app.models import MembershipStatus

    return user.memberships.filter(
        tenant=tenant,
        status=MembershipStatus.ACTIVE,
        role__code__in=OVERRIDE_ROLES,
    ).exists()
