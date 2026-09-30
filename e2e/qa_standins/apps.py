"""Stand-ins for the gate's look pass. Each registers through the PUBLIC seam a module will use:
an origin listener that asks before a void and labels its documents; a calendar reader, so the
Business days hub link and "Applies to" appear; and a reminder policy with a window, so the
reminder-hours rows appear. The module codes are released ones (`inventory`, `sales`) or an
engine name (`dues`), so no unreleased-module flag is needed."""
from django.apps import AppConfig


class StandIn:
    def on_void(self, *, ctx, origin_id, document, reason):
        return None

    def on_settlement_changed(self, *, ctx, origin_id, document):
        return None

    def check_void(self, *, tenant, origin_id):
        return {
            "block": None,
            "confirm": (
                "This invoice is for membership M-0007. Voiding it leaves the membership unpaid."
            ),
        }

    def labels(self, *, tenant, ids):
        return {i: "Membership M-0007" for i in ids}


class QaStandinsConfig(AppConfig):
    name = "qa_standins"
    label = "qa_standins"

    def ready(self):
        from apps.common.seams.documents import register_origin
        from apps.ledger.services.reminder_seam import register_reminder_policy
        from apps.platform_app.services.calendar import register_calendar_reader

        register_origin("dues_charge", module="dues", listener=StandIn())
        register_calendar_reader("inventory")
        import datetime as dt

        register_reminder_policy(
            "sales", {"window": (dt.time(9, 0), dt.time(19, 0)), "daily_cap_per_source": 1}
        )
