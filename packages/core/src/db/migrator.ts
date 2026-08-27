import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { getDb } from "./client.js";

/**
 * Locate the committed migrations folder.
 *
 * Resolved from this module rather than process.cwd(), because the API, the
 * worker and the CLI all boot from different directories. In a built package
 * this file sits at dist/db/, so the folder is three levels up; in tests and
 * `tsx` runs it sits at src/db/. Both are checked.
 */
export function migrationsFolder(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    resolve(here, "../../drizzle"), // dist/db -> packages/core/drizzle
    resolve(here, "../../../drizzle"), // nested build layouts
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Could not find the drizzle migrations folder from ${here}. ` +
      `It must ship with @meridian/core — check the Dockerfile copies packages/core/drizzle.`,
  );
}

/**
 * Apply every pending migration, in order, exactly once.
 *
 * drizzle records what it has applied in drizzle.__drizzle_migrations, so this
 * is safe to call on every boot and safe to run concurrently from more than one
 * instance — the migrator takes a lock for the duration.
 */
export async function applyMigrations(): Promise<void> {
  await migrate(getDb(), { migrationsFolder: migrationsFolder() });
}
