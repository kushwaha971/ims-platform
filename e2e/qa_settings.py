"""Wave A gate QA only (never committed): the local settings plus stand-in registrations that
make the Wave A screens reachable, because no module that uses them is released yet."""
from config.settings.local import *  # noqa: F401,F403
from config.settings.local import INSTALLED_APPS

INSTALLED_APPS = [*INSTALLED_APPS, "qa_standins"]
