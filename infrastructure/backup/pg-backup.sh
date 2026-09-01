#!/bin/sh
# Nightly Postgres backup.
#
# Runs inside a container alongside the database (see the `backup` service in
# docker-compose.prod.yml). Deliberately a plain shell loop rather than cron: the container has
# one job, a crashed loop is visible in `docker ps` and the compose restart policy brings it back,
# whereas a dead cron daemon looks identical to a healthy one.
#
# RESTORE (destructive — this replaces the current database):
#   gunzip -c /backups/<file>.sql.gz | docker exec -i mashuphost-postgres-1 \
#     psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
#
# Verify a backup is real before trusting it — a zero-byte or truncated dump restores as an
# empty database, which is worse than no backup because it looks like one:
#   gunzip -t /backups/<file>.sql.gz && gunzip -c /backups/<file>.sql.gz | head -5
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"

mkdir -p "$BACKUP_DIR"

log() { echo "[backup] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"; }

run_backup() {
  # Prune BEFORE dumping, not after. This platform has already lost its database once to a full
  # disk; freeing the old copies first means the new dump has somewhere to go instead of the
  # backup job being the thing that fills the volume.
  find "$BACKUP_DIR" -name '*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true

  target="$BACKUP_DIR/mashuphost-$(date -u '+%Y%m%d-%H%M%S').sql.gz"
  tmp="$target.partial"

  # Written to a .partial name and renamed only on success, so an interrupted or failed dump can
  # never be mistaken for a usable backup by the restore command or the retention sweep.
  if pg_dump -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges \
      | gzip -c > "$tmp"; then
    if [ -s "$tmp" ] && gzip -t "$tmp" 2>/dev/null; then
      mv "$tmp" "$target"
      log "wrote $(basename "$target") ($(du -h "$target" | cut -f1))"
    else
      rm -f "$tmp"
      log "ERROR dump produced an empty or corrupt file — not kept"
      return 1
    fi
  else
    rm -f "$tmp"
    log "ERROR pg_dump failed"
    return 1
  fi
}

log "starting: every ${INTERVAL_SECONDS}s, keeping ${RETENTION_DAYS} days in ${BACKUP_DIR}"
while true; do
  run_backup || log "backup attempt failed — will retry on the next interval"
  sleep "$INTERVAL_SECONDS"
done
