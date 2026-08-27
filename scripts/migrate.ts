import { registerEntities, runMigrations, getDb, closeDb } from "@meridian/core";
import { allEntities } from "@meridian/entities";

async function main() {
  registerEntities(allEntities);
  getDb();
  await runMigrations();
  console.log("Migration complete");
  await closeDb();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
