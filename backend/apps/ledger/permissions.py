"""Permission maps for the ledger app (canon §0.9, Part 20 §20.5.5)."""

from __future__ import annotations

from apps.common.permissions import HasPermission

# `HasPermission` is fail-closed: an action missing from this map is denied.
#
# The accountant holds `ledger.entry.read` and not `ledger.entry.write`
# (`permissions_registry.py`), which is T-LED-01-12: they read the book and
# cannot post to it. Staff hold `write` and not `correct`, which is the other
# half of that test — they record what happens at the counter and cannot go past
# a limit the owner set.
#
# `ledger.entry.correct` is NOT in this map, and its absence is deliberate: the
# override is not an action on this route. It is a decision inside `post_entry`,
# made on the actor's ROLE rather than on a codename (BR-8), because a tenant
# that grants a codename to the counter must not thereby hand them the power to
# lend past the cap. `parties/services/credit.may_override` is the one place
# that check lives.
LedgerEntryPermissions = HasPermission(
    {
        "create": "ledger.entry.write",
        "list": "ledger.entry.read",
        "retrieve": "ledger.entry.read",
        # BR-8 — reversing and correcting need `ledger.entry.correct`, which
        # `permissions_registry.py` gives the owner and the manager and does NOT
        # give staff. The counter records what happens at the counter; going
        # back and changing a number somebody has already been told is the
        # owner's decision, and it is the one thing in the ledger a shopkeeper
        # would not delegate.
        #
        # This IS a codename check, unlike the credit-limit override in
        # `post_entry`, and the difference is worth stating because the two look
        # alike. The override is a business ceiling the owner set, so a tenant
        # must not be able to hand it to the counter by granting a permission.
        # A correction is an ordinary capability: a tenant that wants their
        # senior cashier to fix typos should be able to say so.
        "reverse": "ledger.entry.correct",
        "correct": "ledger.entry.correct",
    }
)
