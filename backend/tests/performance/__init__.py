"""Performance gates that run as ordinary tests.

A budget nobody measures is documentation. These run in the same `pytest`
invocation as everything else, so a developer sees a breach before pushing and
CI's "pytest (fast bands, with coverage and query budgets)" step is finally
telling the truth about its own name.
"""
