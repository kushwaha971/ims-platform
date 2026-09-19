"""Signals for the parties app.

Rule D9 (Part 20 §20.1.4): a signal may only do things that are safe to lose.
There are none at MVP — the balance cache is written by a service, never here.
"""

from __future__ import annotations
