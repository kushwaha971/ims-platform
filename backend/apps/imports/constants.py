"""Enumerations and limits owned by the imports app (Part 26 §26.16 R16.1).

IMP-01 §17.8.0 fixes the vocabulary and the limits for every import kind; a kind
may LOWER a limit (INV-09 caps items at 5,000) and never raise one.
"""

from __future__ import annotations

from django.db import models
from django.utils.translation import gettext_lazy as _


class ImportStatus(models.TextChoices):
    """Canon §0.7's import-job set, used verbatim by every kind (§17.8.0)."""

    UPLOADED = "uploaded", _("Uploaded")
    VALIDATING = "validating", _("Checking")
    READY = "ready", _("Ready")
    IMPORTING = "importing", _("Importing")
    COMPLETED = "completed", _("Completed")
    FAILED = "failed", _("Failed")
    CANCELLED = "cancelled", _("Cancelled")


#: The statuses a job can still leave. The client polls while a job is in one.
LIVE_STATUSES = frozenset(
    {ImportStatus.UPLOADED, ImportStatus.VALIDATING, ImportStatus.READY, ImportStatus.IMPORTING}
)
#: FR-7 — what Cancel is allowed from. `importing` is refused: the transaction is
#: already running and commits whole or rolls back whole.
CANCELLABLE_STATUSES = frozenset(
    {ImportStatus.UPLOADED, ImportStatus.VALIDATING, ImportStatus.READY}
)
TERMINAL_STATUSES = frozenset({ImportStatus.COMPLETED, ImportStatus.FAILED, ImportStatus.CANCELLED})

# ── §17.8.0 limits ────────────────────────────────────────────────────────────
MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_ROWS = 10_000
MAX_COLUMNS = 200
#: `imports_job.errors` keeps the first 500; the rest are counted and are in the
#: error CSV, which carries every failing row.
ERRORS_CAP = 500
WARNINGS_CAP = 200
PREVIEW_ROWS = 20
#: FR-4 — `result.progress` is written every 200 rows.
PROGRESS_EVERY = 200
#: The error model truncates the echoed value to 80 characters.
VALUE_ECHO_MAX = 80

#: FR-12 — how long a job may sit in a running state before it is treated as
#: interrupted. The commit is one transaction, so an interrupted commit has
#: already been rolled back by the database; the merchant may commit again.
STALE_VALIDATING_MINUTES = 10
STALE_IMPORTING_MINUTES = 30

# ── platform_job types ────────────────────────────────────────────────────────
JOB_VALIDATE = "imports.validate"
JOB_COMMIT = "imports.commit"

#: The owner type the stored upload and its error file carry on `files_attachment`.
OWNER_JOB = "imports_job"
OWNER_JOB_ERRORS = "imports_job_errors"

#: FR-13 — the advisory-lock namespace a commit takes per tenant, so two files
#: cannot race on the same uniqueness checks.
COMMIT_LOCK_NAMESPACE = 0x1D1

# ── Audit actions (IMP-01 §16) ───────────────────────────────────────────────
# Kept beside the feature that writes them rather than in the shared vocabulary
# class, so two tracks adding actions in the same sprint do not collide on one
# block of `apps/common/audit.py`. The strings are §16's.
AUDIT_IMPORT_REQUESTED = "import.requested"
AUDIT_IMPORT_VALIDATED = "import.validated"
AUDIT_IMPORT_COMMITTED = "import.committed"
AUDIT_IMPORT_FAILED = "import.failed"
AUDIT_IMPORT_CANCELLED = "import.cancelled"
AUDIT_IMPORT_ERROR_FILE = "import.error_file_downloaded"
