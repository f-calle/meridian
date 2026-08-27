import { runMigrations } from "./bootstrap.js";
import { closeDb } from "./client.js";
import { closeSql } from "./raw-sql.js";

// System tables only — entity tables require entities to be registered,
// which the root scripts/migrate.ts and the apps do at startup.
runMigrations()
  .then(async () => {
    console.log("Migration complete");
    await closeDb();
    await closeSql();
  })
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
