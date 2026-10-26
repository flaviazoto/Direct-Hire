# Database migrations

## How the history is organised

| Folder | Contents |
|---|---|
| `backend/prisma/migrations/` | The live chain: a **baseline** plus everything after it. |
| `backend/prisma/archived_migrations/` | The pre-baseline history, kept for reference only. Never applied. |
| `backend/prisma/manual/` | SQL that needs explicit approval and is never run automatically. |

The old chain couldn't build an empty database. Its "initial schema" was a
later snapshot that clashed with the migrations after it, and several applied
migrations had been edited afterwards. Production had also drifted: it was
partly built outside the history. On 2026-10-26 the chain was replaced:

1. `20261026000000_baseline`: the complete schema from `schema.prisma`,
   including the `citext` extension. Production uses `CITEXT` for
   `User.email`, which makes the unique index case-insensitive; the schema
   now declares it too.
2. `20261026000100_reconcile_production`: brings production in line
   without destroying data:
   - removes orphan rows left by deleted users;
   - adds the 9 missing foreign keys;
   - adds missing indexes and unique Stripe IDs;
   - aligns column types and defaults.

   It is idempotent and does nothing on a database built from the baseline.
3. `20261026000200_repair_application_counts`: recomputes
   `job_posts.application_count`.

## Fresh database (local, CI, staging)

```bash
cd backend
npx prisma migrate deploy
```

Verified: an empty database plus these migrations exactly matches `schema.prisma`
(`prisma migrate diff --from-url <db> --to-schema-datamodel prisma/schema.prisma`
reports no changes).

## Production: one-time switch to the baseline

Migrations are **not** part of the Railway/Vercel auto-deploy. Check this
before step 4: the Railway service must have no pre-deploy or release command
running `prisma migrate deploy`.

Rehearsed on a structural replica of production (the schema introspected
read-only from production, seeded with synthetic rows that reproduce
production's orphans). The replica ended with the expected row counts, valid
foreign keys, and only the legacy objects listed below left as drift.

1. **Backup.** Take a Supabase backup, or confirm point-in-time recovery, and
   note the restore point.
2. **Load production credentials for this shell only** (never into `.env`):
   `export DATABASE_URL=… DIRECT_URL=…` with `DIRECT_URL` on port 5432.
3. **Check:** `npx prisma migrate status`. Expected: the two new migrations
   are listed as not yet applied, and the old ones as "not found locally". The
   old ones are archived, so that's expected.
4. **Record the baseline as already present** (writes one row to
   `_prisma_migrations`, no schema change):
   `npx prisma migrate resolve --applied 20261026000000_baseline`
5. **Apply:** `npx prisma migrate deploy`. This runs the reconcile and the
   count repair inside Prisma's migration transaction handling.
6. **Verify:** `npx prisma migrate status` should report "Database schema is
   up to date". Then run
   `npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script`.
   It should list only the legacy objects below.

**What step 5 changes in production** (counts from a read-only check on 2026-10-26):

| | Rows |
|---|---|
| Sessions of deleted users (deleted) | 100 |
| Email-verification tokens of deleted users (deleted) | 7 |
| Onboarding / verification records of deleted users (deleted) | 33 / 33 |
| Verification records whose reviewer was deleted (`reviewedById` → NULL) | 31 |
| Email logs / audit logs of deleted users (kept, `userId` → NULL) | 46 / 41 |
| Jobs with a wrong application count (recomputed) | 2 |

**Rollback:** the reconcile only adds constraints and indexes, deletes rows
that referenced no existing user, and nulls dangling references. To undo,
restore the backup from step 1. If the application misbehaves only
because of a new constraint, drop that constraint
(`ALTER TABLE … DROP CONSTRAINT …`). That's safe, since no code depends on
the constraints.

## Legacy objects (manual, needs approval)

`prisma/manual/legacy_cleanup.sql` drops production-only objects that no code
uses:
- tables `Skill` (61 rows), `trust_score_history` (3 rows), `Subscription`
  and `job_required_skills` (empty);
- `Payment`'s legacy columns (all NULL);
- `User.phoneEnc` (4 rows) and `WorkerProfile.passportNumberEnc` (1 row);
- `WorkerSkill.skill_id` and three legacy enums.

Export anything worth keeping first. The encrypted columns hold personal
data: confirm they've been migrated to the current fields before dropping
them. After the cleanup, the diff in step 6 is empty.

## Making schema changes from now on

```bash
cd backend
npm run db:migrate -- --name <change>   # local dev DB only (guarded)
```

Commit the generated folder. Rehearse it on a staging or restored copy, then
apply it to production with `npx prisma migrate deploy`. Never edit a
migration that has already been applied anywhere, and never run
`migrate dev` or `migrate reset` against production.
