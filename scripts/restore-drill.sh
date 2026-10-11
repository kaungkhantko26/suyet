#!/usr/bin/env sh
# Restore DRILL: proves a backup is usable WITHOUT touching production. Restores into a throwaway Postgres container,
# runs sanity queries, then deletes it.   BACKUP_AGE_IDENTITY=… ./scripts/restore-drill.sh backups/db-….dump.age
set -eu
[ $# -eq 1 ] || { echo "usage: $0 <db-dump.age>"; exit 1; }
: "${BACKUP_AGE_IDENTITY:?}"
NAME="lte-restore-drill-$$"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }; trap cleanup EXIT
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=drill postgres:16.6-alpine >/dev/null
i=0; until docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; do i=$((i+1)); [ $i -lt 30 ] || { echo "postgres did not start"; exit 1; }; sleep 1; done
age -d -i "$BACKUP_AGE_IDENTITY" "$1" | docker exec -i "$NAME" pg_restore -U postgres -d drill --no-owner
USERS=$(docker exec "$NAME" psql -U postgres -d drill -Atc 'SELECT count(*) FROM "User"')
EVENTS=$(docker exec "$NAME" psql -U postgres -d drill -Atc 'SELECT count(*) FROM "Event"')
MIG=$(docker exec "$NAME" psql -U postgres -d drill -Atc 'SELECT count(*) FROM _prisma_migrations')
echo "Restore drill OK: users=$USERS events=$EVENTS migrations=$MIG (record this date in your drill log)"
