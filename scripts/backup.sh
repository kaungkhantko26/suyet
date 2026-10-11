#!/usr/bin/env sh
# Encrypted backup of PostgreSQL + uploaded files. Run from the project directory on the VPS.
#   BACKUP_AGE_RECIPIENT=age1…  ./scripts/backup.sh [output-dir]
# The dump is encrypted with `age` (public-key) as it is written: plaintext never touches the disk. Keep the PRIVATE key
# (identity) OFF the server, in at least two places (see docs/BACKUP_RECOVERY.md). Optional: BACKUP_REMOTE=rclone-remote:path
# to copy off-host, HEALTHCHECK_URL=… to ping a dead-man's-switch monitor (alerts you when backups stop).
set -eu
umask 077
: "${BACKUP_AGE_RECIPIENT:?set BACKUP_AGE_RECIPIENT (age public key) – refusing to write an unencrypted backup}"
command -v age >/dev/null 2>&1 || { echo "age is not installed (apt install age)"; exit 1; }
OUT="${1:-./backups}"; STAMP="$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"
DB_FILE="$OUT/db-$STAMP.dump.age"; UP_FILE="$OUT/uploads-$STAMP.tgz.age"

docker compose exec -T db pg_dump -U postgres -d letstech_events --format=custom --no-owner | age -r "$BACKUP_AGE_RECIPIENT" -o "$DB_FILE"
docker run --rm -v letstech-events_uploads:/data:ro alpine tar czf - -C /data . | age -r "$BACKUP_AGE_RECIPIENT" -o "$UP_FILE"

( cd "$OUT" && sha256sum "$(basename "$DB_FILE")" "$(basename "$UP_FILE")" > "checksums-$STAMP.sha256" )
[ -s "$DB_FILE" ] || { echo "backup is empty, failing"; exit 1; }

if [ -n "${BACKUP_REMOTE:-}" ]; then rclone copy "$OUT" "$BACKUP_REMOTE" --include "*-$STAMP.*"; fi

# Retention: keep 14 days locally (off-site retention is managed on the remote).
find "$OUT" -type f \( -name 'db-*.age' -o -name 'uploads-*.age' -o -name 'checksums-*.sha256' \) -mtime +14 -delete

[ -z "${HEALTHCHECK_URL:-}" ] || curl -fsS -m 10 "$HEALTHCHECK_URL" >/dev/null
echo "Encrypted backup written to $OUT ($STAMP)"
