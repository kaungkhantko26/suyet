#!/bin/sh
# Runs once, on first initialisation of the data directory (docker-entrypoint-initdb.d), as the bootstrap superuser.
# Creates the two non-superuser identities and makes the migrator the owner of the application database.
# Table-level grants for the runtime role are applied after every migration by `tsx scripts/db-roles.ts grants`.
set -eu
: "${APP_DB_PASSWORD:?}" "${MIGRATOR_DB_PASSWORD:?}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_pw="$APP_DB_PASSWORD" -v mig_pw="$MIGRATOR_DB_PASSWORD" -v db="$POSTGRES_DB" <<'SQL'
CREATE ROLE letstech_migrator LOGIN PASSWORD :'mig_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE letstech_app     LOGIN PASSWORD :'app_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO letstech_app, letstech_migrator;
ALTER DATABASE :"db" OWNER TO letstech_migrator;
SQL
