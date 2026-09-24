"""AppConfig for the ledger app (Part 20 §20.1.2)."""

from __future__ import annotations

from django.apps import AppConfig


class LedgerConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.ledger"
    label = "ledger"
    verbose_name = "Ledger"

    def ready(self) -> None:
        from apps.ledger import tasks  # noqa: F401  (registers job handlers)
        from apps.ledger.services.write_off import write_off_party_balance
        from apps.parties.services.write_off import register_write_off_handler

        # PTY-04 FR-3. `parties` owns the archive endpoint and may not import
        # the ledger (Part 20 §20.1.4), so it declares a write-off PORT and the
        # ledger fills it here — the same registry-in-`ready()` pattern the job
        # handlers above use. See `parties/services/write_off.py` for why a
        # port and not a signal.
        register_write_off_handler(write_off_party_balance)

        # LED-05 BR-2 — the same port shape, the other way round: `parties`
        # clears a settled party's collection date and calls whatever the
        # ledger registered to cancel that party's scheduled reminders.
        from apps.ledger.services.reminders import cancel_scheduled_reminders
        from apps.parties.services.balance import register_settle_handler

        register_settle_handler(cancel_scheduled_reminders)
