/**
 * Render the entity registry into packages/core/src/db/entity-schema.generated.ts.
 *
 * Run via `pnpm db:generate`, which then hands the result to drizzle-kit to
 * diff against the last snapshot and emit a versioned migration.
 *
 * `--check` writes nothing and exits non-zero when the committed file is stale —
 * that's the CI guard against "changed an entity, forgot the migration".
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerEntities, renderEntitySchema, entityRegistry } from "@meridian/core";
import { allEntities } from "@meridian/entities";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../packages/core/src/db/entity-schema.generated.ts");

registerEntities(allEntities);
const rendered = renderEntitySchema(entityRegistry.list());

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(target, "utf8");
  } catch {
    current = "";
  }
  if (current !== rendered) {
    console.error(
      [
        "Generated drizzle schema is out of date.",
        "",
        "An entity definition changed but the schema and migration weren't regenerated.",
        "Run `pnpm db:generate` and commit the result, including the new migration",
        "under packages/core/drizzle/.",
      ].join("\n"),
    );
    process.exit(1);
  }
  console.log("Generated drizzle schema is up to date");
} else {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, rendered);
  console.log(`Wrote ${target} (${entityRegistry.list().length} entities)`);
}
