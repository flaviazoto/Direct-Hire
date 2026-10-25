# Local development

Local development and automated tests never use the production database.
`backend/.env` points at a local Postgres with two databases:

| Database  | Used by |
|-----------|---------|
| `dh_dev`  | `npm run dev`, seeds, manual testing |
| `dh_test` | automated API tests |

Connection: `postgresql://directhire:directhire_local_only@localhost:5434/<db>`.
The password is not a secret. The server listens on localhost only.

## Start the database

**Option A: native PostgreSQL 16 on Windows.** This is the current setup on the main dev laptop.

```bash
# one-time setup (already done on the main dev laptop)
initdb -D "$LOCALAPPDATA/DirectHire/pgdata" -U directhire -W -A scram-sha-256 -E UTF8 --no-locale
pg_ctl -D "$LOCALAPPDATA/DirectHire/pgdata" -o "-p 5434 -c listen_addresses=localhost" -l "$LOCALAPPDATA/DirectHire/postgres.log" start
psql -h localhost -p 5434 -U directhire -d postgres -c "CREATE DATABASE dh_dev" -c "CREATE DATABASE dh_test"

# each session
pg_ctl -D "$LOCALAPPDATA/DirectHire/pgdata" -o "-p 5434 -c listen_addresses=localhost" -l "$LOCALAPPDATA/DirectHire/postgres.log" start
```

**Option B: Docker.**

```bash
cd backend
docker compose -f docker-compose.dev.yml up -d
```

## Create the schema and seed data

```bash
cd backend
npm run db:guard                          # confirms .env points at a local database
npx prisma db push --skip-generate        # until the migration baseline is fixed
npm run db:seed                           # synthetic users only
```

`prisma migrate deploy` cannot build an empty database yet: the initial schema
is in `prisma/archived_migrations`. Until the migration baseline is repaired,
use `db push` for local databases only.

## Safety guard

`src/lib/db-guard.ts` refuses any database host that isn't local:

- **Runtime:** the API and every script that imports `src/lib/prisma`, when
  `NODE_ENV` is `development` or `test`. Production runs with
  `NODE_ENV=production` and is unaffected.
- **Destructive npm scripts:** `db:migrate`, `db:reset`, `db:seed` and
  `seed:demo` always run `scripts/guard-db.ts` first, whatever `NODE_ENV` is.

To use a staging database, add its exact `host|user` pair to `DB_GUARD_ALLOW`.
Never add production.

## Production credentials

The production values that used to be in `backend/.env` are now in
`backend/.env.production`. That file is gitignored, readable only by the
owner account, and never loaded automatically. Don't copy it back to `.env`.
Remove it from the laptop once the values are confirmed in Railway.

For an approved, read-only production operation (for example
`npm run backup:db`), load that file explicitly for that one command:

```bash
DOTENV_CONFIG_PATH=.env.production NODE_ENV=production npm run backup:db
```

Schema changes reach production only through `npm run db:migrate:prod`
(`prisma migrate deploy`), after they have been tested against a restored copy.

## Local backups

`backend/backups/` contains JSON exports of production: personal data and
session tokens. It is gitignored and restricted to the owner account,
SYSTEM and Administrators. Don't copy, sync or share it. Delete exports once
a verified Supabase backup and restore procedure exists.

## Not available locally

- **Google sign-in:** the client ID in `.env` is a placeholder.
- **Email:** `EMAIL_PROVIDER=console` prints messages to the API log.
- **Storage:** `STORAGE_PROVIDER=local` writes files under `backend/.uploads/`.
