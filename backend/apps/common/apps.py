"""AppConfig for the shared kernel (Part 20 §20.1.2)."""

from __future__ import annotations

import logging
import os

from django.apps import AppConfig

logger = logging.getLogger("ub.common")


class CommonConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.common"
    label = "common"
    verbose_name = "Common"

    def ready(self) -> None:
        """Warn about unrecognised `UB_` variables (Part 20 §20.13.2)."""
        from apps.common.env_catalogue import KNOWN_UB_VARIABLES

        unknown = sorted(
            key for key in os.environ if key.startswith("UB_") and key not in KNOWN_UB_VARIABLES
        )
        if unknown:
            logger.warning("settings.unknown_env_vars", extra={"variables": unknown})
