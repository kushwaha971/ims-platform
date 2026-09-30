#!/usr/bin/env bash
# Create (or re-activate) the DEMO platform operator for the super-admin video.
# Requires the lead's approval: it creates a user with is_super_admin=True on
# the dev DB. The password is random, stored only in .secrets/accounts.json
# (0600), and never printed.  Deactivate afterwards with:  make_operator.sh --deactivate
set -euo pipefail
EMAIL="support.demo@yourkhata.example"
SECRETS=/home/claude/video/.secrets/accounts.json
cd /home/claude/repo/backend
if [ "${1:-}" = "--deactivate" ]; then
  python manage.py shell -c "from apps.platform_app.models import User; User.objects.filter(email='$EMAIL').update(is_active=False, is_super_admin=False); print('deactivated')"
  exit 0
fi
PW="Op$(python3 -c 'import secrets;print(secrets.token_urlsafe(12))')9!"
UB_OP_PW="$PW" python manage.py shell -c "
import os
from apps.platform_app.models import User
u = User.objects.filter(email='$EMAIL').first()
if u is None:
    u = User.objects.create_superuser('$EMAIL', os.environ['UB_OP_PW'], full_name='Platform Support')
else:
    u.set_password(os.environ['UB_OP_PW']); u.is_super_admin = True; u.is_active = True; u.full_name = 'Platform Support'; u.save()
print('operator ready')
"
python3 - "$EMAIL" "$PW" "$SECRETS" <<'PY'
import json, os, sys
email, pw, path = sys.argv[1:]
os.makedirs(os.path.dirname(path), mode=0o700, exist_ok=True)
d = json.load(open(path)) if os.path.exists(path) else {}
d['operator'] = {'email': email, 'password': pw}
json.dump(d, open(path, 'w'), indent=2); os.chmod(path, 0o600)
print('saved to .secrets (not printed)')
PY
