#!/usr/bin/env bash
# ==============================================================================
# Create .env.production from the example, generating every cryptographic secret
# on the server so none is ever typed, pasted, or transported.
#
#   cd /opt/mashuphost && bash infrastructure/scripts/init-production-env.sh
#
# Refuses to overwrite an existing .env.production -- regenerating JWT secrets
# invalidates every live session, and regenerating ENCRYPTION_KEY makes every
# already-encrypted value (per-tenant M-Pesa credentials among them) permanently
# unreadable. Rotating those is a deliberate act, never a side effect of re-running
# a setup script.
# ==============================================================================
set -euo pipefail

cd "$(dirname "$0")/../.."

if [[ -f .env.production ]]; then
  echo "ERROR: .env.production already exists. Refusing to overwrite it." >&2
  echo "To start over deliberately: mv .env.production .env.production.bak" >&2
  exit 1
fi

if [[ ! -f .env.production.example ]]; then
  echo "ERROR: .env.production.example not found -- are you in the repo root?" >&2
  exit 1
fi

cp .env.production.example .env.production
chmod 600 .env.production

# Each secret is generated separately. Reusing one value across JWT_ACCESS_SECRET,
# JWT_REFRESH_PEPPER and ENCRYPTION_KEY would mean a leak of any one compromises all
# three -- and the example file uses an identical placeholder on all three lines, so a
# naive global find-and-replace would do exactly that.
DB_PASSWORD="$(openssl rand -hex 24)"

set_var() {
  # Replace a whole KEY=... line. The value goes in via an env var rather than being
  # interpolated into the sed script, so hex output can never be read as sed syntax.
  local key="$1" value="$2"
  VALUE="$value" perl -pi -e "s|^\Q$key\E=.*|$key=\$ENV{VALUE}|" .env.production
}

set_var POSTGRES_PASSWORD  "$DB_PASSWORD"
set_var DATABASE_URL       "postgresql://mashupkgrid:${DB_PASSWORD}@postgres:5432/mashupkgrid_isp?schema=public"
set_var JWT_ACCESS_SECRET  "$(openssl rand -hex 32)"
set_var JWT_REFRESH_PEPPER "$(openssl rand -hex 32)"
set_var ENCRYPTION_KEY     "$(openssl rand -hex 32)"

echo "Created .env.production (mode 600) with freshly generated secrets."
echo

remaining="$(grep -cE 'CHANGE_ME|YOUR_' .env.production || true)"
if [[ "$remaining" -gt 0 ]]; then
  echo "$remaining placeholder(s) still need real values:"
  grep -nE 'CHANGE_ME|YOUR_' .env.production | sed 's/=.*/=<fill this in>/'
  echo
  echo "The M-Pesa and SMS ones can stay as-is for a first deploy -- per-tenant M-Pesa"
  echo "credentials are configured in the admin UI and encrypted at rest. Fill them in"
  echo "before taking live payments."
else
  echo "No placeholders remain."
fi

echo
echo "Secrets are in .env.production only. It is gitignored -- never commit it."
