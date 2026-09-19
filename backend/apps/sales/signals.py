"""Signals for the sales app.

Rule D9 (Part 20 §20.1.4): a signal may only do things that are safe to
lose — cache invalidation, `transaction.on_commit` notification enqueues.
Never balance maths, never ledger writes.

There are none at MVP.
"""

from __future__ import annotations
