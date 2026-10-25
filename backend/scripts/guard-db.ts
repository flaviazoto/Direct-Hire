// backend/scripts/guard-db.ts
// Pre-flight for destructive npm scripts (migrate dev, reset, seeds).
// Always enforced, whatever NODE_ENV says. Exits non-zero to stop the chain.
//
// Run: tsx scripts/guard-db.ts <script-name>

import "dotenv/config";
import { assertSafeDatabaseTarget } from "../src/lib/db-guard";

try {
  assertSafeDatabaseTarget(process.argv[2] ?? "destructive script");
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
