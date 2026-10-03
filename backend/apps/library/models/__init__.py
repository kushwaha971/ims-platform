"""The library's tables. Each task adds its module here (B03 settings, B05 catalogue, …)."""

from __future__ import annotations

from apps.library.models.settings import LibrarySettings

__all__ = ["LibrarySettings"]
