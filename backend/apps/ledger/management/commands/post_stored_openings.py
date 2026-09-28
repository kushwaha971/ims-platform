"""`manage.py post_stored_openings` — post the openings PTY-01 recorded and never applied.

Between PTY-01 and LED-02 the party form wrote `opening_balance_amount`,
`_direction` and `_as_of` to `parties_party` and posted nothing, because
`ledger_entry` did not exist. Every party created in that window is carrying a
figure a merchant typed and a balance of ₹0.00, and no code path will ever
reconcile the two on its own: `create_party` posts the entry going forward, and
nothing looks backwards.

This is the one-time pass that looks backwards. It is a command rather than a
data migration for two reasons. It writes audit rows and takes row locks through
the service layer, and a migration that calls a service is a migration that
breaks the next time the service changes — Part 21 §21.8 separates schema from
data for exactly this. And it must be RE-RUNNABLE and REPORT-ONLY by default: a
merchant's opening balance is money, and the operator running this should see
what it is about to post before it posts it.

Idempotent by construction. `post_opening_balance()` refuses a party that
already has a posted opening (BR-2), so a second run skips everything the first
run did — and the partial unique index means that holds even if two operators
run it at once.

Deliberately NOT scheduled. There is no recurring version of this job: it exists
to close one window, and a nightly task that posts opening balances is a nightly
task that will one day post one nobody asked for.
"""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand

from apps.common.context import Ctx
from apps.common.exceptions import DomainError
from apps.parties.models import Party


class Command(BaseCommand):
    help = "Post ledger entries for opening balances PTY-01 stored before LED-02. Report-only unless --apply."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("--tenant", default=None, help="Restrict to one tenant id.")
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Post the entries. Without it the command only reports what it would post.",
        )

    def handle(self, *args: Any, **opts: Any) -> None:
        from apps.ledger.constants import EntryStatus, EntryType
        from apps.ledger.models import LedgerEntry
        from apps.ledger.services.opening import post_opening_balance

        # Every party carrying all three columns. The `None` checks are separate
        # rather than one `isnull` filter because a party with an amount and no
        # date is a half-written record, and reporting it is more useful than
        # silently leaving it out of a count the operator is reading.
        candidates = Party.all_objects.filter(
            opening_balance_amount__isnull=False,
            opening_balance_direction__isnull=False,
            opening_balance_as_of__isnull=False,
        ).order_by("created_at")
        if opts["tenant"]:
            candidates = candidates.filter(tenant_id=opts["tenant"])

        already = set(
            LedgerEntry.objects.filter(
                entry_type=EntryType.OPENING, status=EntryStatus.POSTED
            ).values_list("party_id", flat=True)
        )

        posted = skipped = failed = 0
        for party in candidates.iterator(chunk_size=500):
            if party.id in already:
                skipped += 1
                continue
            self.stdout.write(
                f"{'post ' if opts['apply'] else 'would'}  {party.id}  "
                f"{party.name[:40]:<40}  {party.opening_balance_direction} "
                f"{party.opening_balance_amount} as of {party.opening_balance_as_of}"
            )
            if not opts["apply"]:
                posted += 1
                continue
            # `actor_type='system'`, so the entry's `created_by` is null and the
            # timeline says nothing about who wrote it — which is true. Nobody
            # did; a migration did, and FR-8's "by <name>" would be a lie about a
            # colleague.
            ctx = Ctx(
                tenant=party.tenant,
                actor=None,
                actor_type="system",
                request_id="post_stored_openings",
                ip=None,
                user_agent=None,
            )
            try:
                post_opening_balance(
                    ctx=ctx,
                    party_id=party.id,
                    amount=party.opening_balance_amount,
                    direction=party.opening_balance_direction,
                    as_of=party.opening_balance_as_of,
                    via="backfill",
                )
                posted += 1
            except DomainError as error:
                # An archived party, or a figure that fails today's validation —
                # a date before 2000, say, typed when nothing checked it. Both
                # are reported and neither stops the run: an operator wants the
                # other four hundred posted and a list of the six that need a
                # human.
                failed += 1
                self.stderr.write(f"skip  {party.id}  {party.name[:40]}: {error}")

        verb = "posted" if opts["apply"] else "to post"
        self.stdout.write(
            self.style.SUCCESS(
                f"post_stored_openings: {posted} {verb}, {skipped} already had one, {failed} refused."
            )
        )
