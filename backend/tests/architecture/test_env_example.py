"""`.env.example` is the Part 29 §29.2.4 catalogue (task S0-11)."""

from __future__ import annotations

import pathlib

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[2]
ENV_EXAMPLE = BACKEND_ROOT / ".env.example"


def _declared() -> dict[str, str]:
    values = {}
    for raw in ENV_EXAMPLE.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip()
    return values


def test_env_example_exists_and_is_committed() -> None:
    assert ENV_EXAMPLE.is_file()


def test_every_ub_variable_the_app_knows_about_has_a_default() -> None:
    from apps.common.env_catalogue import KNOWN_UB_VARIABLES

    declared = set(_declared())
    # UB_ROLE and UB_SECRET_KEY_FALLBACKS are set by the runtime, not by the file.
    expected = KNOWN_UB_VARIABLES - {"UB_ROLE", "UB_SECRET_KEY_FALLBACKS"}
    missing = expected - declared
    assert missing == set(), f"missing from .env.example: {sorted(missing)}"


def test_no_ub_variable_in_the_file_is_unknown_to_the_app() -> None:
    from apps.common.env_catalogue import KNOWN_UB_VARIABLES

    unknown = {k for k in _declared() if k.startswith("UB_")} - KNOWN_UB_VARIABLES
    assert unknown == set(), f"not in the catalogue: {sorted(unknown)}"


def test_the_committed_file_carries_no_real_secret() -> None:
    values = _declared()
    assert values["UB_SECRET_KEY"].startswith("dev-")
    assert values["UB_OTP_PEPPER"].startswith("dev-")
    assert values["POSTGRES_PASSWORD"] == "udhaarbook"


def test_the_settings_module_default_is_one_of_the_four() -> None:
    assert _declared()["DJANGO_SETTINGS_MODULE"] in {
        "config.settings.local",
        "config.settings.staging",
        "config.settings.prod",
        "config.settings.test",
    }
