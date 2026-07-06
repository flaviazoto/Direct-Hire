// backend/scripts/export-db-backup.ts
// Read-only JSON export of every table in the public schema — a pre-migration
// safety net. Uses raw `pg` (not the Prisma client) specifically because the
// production database has legacy tables/columns (e.g. Subscription, Skill,
// trust_score_history, external_jobs, WorkerProfile.passportNumberEnc) that
// schema.prisma no longer declares — Prisma's client can only see what's in
// the current schema, so it would silently skip exactly the data this backup
// exists to protect.
//
// Run: npm run backup:db

import "dotenv/config";
import { Client } from "pg";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const BATCH_SIZE = 1000;

function todayFolderName(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

interface TableRow {
  table_name: string;
}

async function getAllTables(client: Client): Promise<string[]> {
  const res = await client.query<TableRow>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  );
  return res.rows.map((r) => r.table_name);
}

async function exportTable(client: Client, table: string, outDir: string): Promise<number> {
  // Quote the identifier defensively — several tables in this DB use
  // PascalCase names ("WorkerProfile", "Payment", ...) that require quoting.
  const quoted = `"${table.replace(/"/g, '""')}"`;

  const rows: unknown[] = [];
  let offset = 0;

  for (;;) {
    const res = await client.query(
      `SELECT * FROM ${quoted} ORDER BY 1 LIMIT $1 OFFSET $2`,
      [BATCH_SIZE, offset],
    );
    rows.push(...res.rows);
    if (res.rows.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  const outFile = path.join(outDir, `${table}.json`);
  writeFileSync(outFile, JSON.stringify(rows, null, 2), "utf8");
  return rows.length;
}

async function main() {
  const connectionString = process.env.DIRECT_URL;
  if (!connectionString) {
    console.error("FATAL: DIRECT_URL is not set (expected the non-pooled, port-5432 connection string).");
    process.exit(1);
  }

  const outDir = path.join(__dirname, "..", "backups", todayFolderName());
  mkdirSync(outDir, { recursive: true });

  const client = new Client({ connectionString });
  await client.connect();

  console.log(`[export-db-backup] connected via DIRECT_URL, writing to ${outDir}`);

  let tables: string[];
  try {
    tables = await getAllTables(client);
  } catch (e) {
    console.error("[export-db-backup] FATAL: failed to list tables:", e);
    await client.end();
    process.exit(1);
  }

  console.log(`[export-db-backup] found ${tables.length} table(s) in public schema`);

  const failures: string[] = [];
  let totalRows = 0;

  for (const table of tables) {
    try {
      const count = await exportTable(client, table, outDir);
      totalRows += count;
      console.log(`[export-db-backup] OK    ${table} — ${count} row(s)`);
    } catch (e) {
      failures.push(table);
      console.error(`[export-db-backup] FAILED ${table}:`, e);
    }
  }

  await client.end();

  console.log(`[export-db-backup] done — ${tables.length - failures.length}/${tables.length} tables exported, ${totalRows} row(s) total`);

  if (failures.length > 0) {
    console.error(`[export-db-backup] FAILED tables: ${failures.join(", ")}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[export-db-backup] FATAL:", e);
  process.exit(1);
});
