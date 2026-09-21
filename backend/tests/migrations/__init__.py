"""Migration reversibility.

`.github/workflows/ci.yml` has run `pytest tests/migrations -q` as its own step
since Sprint 0. The directory did not exist, so the step exited 4 on every run —
the third performance/quality gate in this repository that was named in CI and
doing nothing. It exists now.
"""
