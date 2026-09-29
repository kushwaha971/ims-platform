Planted fixtures for tests/architecture/test_import_rules.py (A11, T-PLT-X14-1).

A fake `gym` vertical and a fake `dues` engine, each with sideways imports spelt
every way the whole-AST walker must see: deferred inside a function, under
`if TYPE_CHECKING:`, relative, through importlib.import_module and __import__,
a star import, and a non-registry module of `reports`/`imports`. Beside them sit
the imports the rules ALLOW (core, an engine the vertical uses, the two R27
registries by each spelling, the app's own modules), which must not be reported.

The files end in `.py.fixture` so pytest, ruff, flake8 and mypy never collect
or lint them; the test parses them with `ast` and nothing ever imports them.
