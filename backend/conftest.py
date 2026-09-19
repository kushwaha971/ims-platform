"""Root conftest.

Puts the backend directory on `sys.path` so `tests.*` imports resolve from the
per-app suites under `apps/`, and exposes the shared fixtures of
`tests/fixtures.py` to every test in the tree.
"""

from __future__ import annotations

import pathlib
import sys

BASE_DIR = pathlib.Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from tests.fixtures import *  # noqa: E402,F401,F403
