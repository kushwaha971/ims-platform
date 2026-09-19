"""Job handlers owned by the help app (Part 26 §26.17).

A handler is registered with `@job_handler`, takes `(job, ctx)`, returns a
small JSON-serialisable dict or None, is idempotent, and calls services
rather than reimplementing them.

Sprint 0 creates the package so the app label, the table prefix and the
import matrix of Part 20 §20.1.4 are reserved. The models, services and
views land in the sprint that owns the feature.
"""

from __future__ import annotations
