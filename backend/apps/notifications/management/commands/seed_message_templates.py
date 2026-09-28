"""`manage.py seed_message_templates` — copy the code defaults into global rows (NTF-02 FR-6).

Not needed for the product to send the right words — `resolve_template` falls
back to `DEFAULT_TEMPLATES` — but it gives an operator a row to put a DLT
template id on once DLT approval lands. Idempotent: an existing row is never
overwritten, because its body may be the version DLT approved.
"""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand

from apps.notifications.constants import TemplateCategory
from apps.notifications.models import MessageTemplate
from apps.notifications.services.templates import DEFAULT_TEMPLATES


class Command(BaseCommand):
    help = "Insert the default message templates as global rows (existing rows are kept)."

    def handle(self, *args: Any, **opts: Any) -> None:
        created = 0
        for (code, channel, locale), body in DEFAULT_TEMPLATES.items():
            _row, was_created = MessageTemplate.objects.get_or_create(
                tenant=None,
                partner=None,
                code=code,
                channel=channel,
                locale=locale,
                defaults={
                    "body": body,
                    "category": (
                        TemplateCategory.TRANSACTIONAL
                        if channel == "whatsapp"
                        else TemplateCategory.SERVICE_IMPLICIT
                    ),
                },
            )
            created += int(was_created)
        self.stdout.write(
            f"Seeded {created} template(s); {len(DEFAULT_TEMPLATES) - created} already present."
        )
