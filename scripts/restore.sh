#!/usr/bin/env sh
# DESTRUCTIVE: replaces the database contents.   BACKUP_AGE_IDENTITY=/secure/path/key.txt ./scripts/restore.sh db-….dump.age
# Stop the app first:  docker compose stop web worker
set -eu
[ $# -eq 1 ] || { echo "usage: $0 <db-dump.age>"; exit 1; }
: "${BACKUP_AGE_IDENTITY:?path to the age private key (kept off the server)}"
printf "This will OVERWRITE the current database. Type 'restore' to continue: "
read -r ans; [ "$ans" = "restore" ] || { echo aborted; exit 1; }
age -d -i "$BACKUP_AGE_IDENTITY" "$1" | docker compose exec -T db pg_restore -U postgres -d letstech_events --clean --if-exists --no-owner
docker compose run --rm migrate sh -c "npx tsx scripts/db-roles.ts grants"   # re-apply least-privilege grants
echo "Restored. Start services: docker compose up -d"
