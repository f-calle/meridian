import { registerEntities, runMigrations, closeDb, closeSql } from "@meridian/core";
import { allEntities } from "@meridian/entities";

async function main() {
  registerEntities(allEntities);
  await runMigrations();
  console.log("Migration complete");
}

main()
  .catch((err) => {
    console.error("Migration failed:\n", (err as Error).message);
    process.exitCode = 1;
  })
  // Both pools have to be drained or the process hangs after a successful run:
  // the migrator uses the drizzle client and the drift check uses raw SQL.
  .finally(async () => {
    await closeDb();
    await closeSql();
  });
