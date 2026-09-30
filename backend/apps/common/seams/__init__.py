"""Ports a vertical or an engine calls without importing the app behind them (ADR-045).

Everything here imports only `apps.common` and Django (rule D1,
`tests/architecture/test_import_rules.py::test_the_document_seam_imports_no_other_app_anywhere`).
"""
