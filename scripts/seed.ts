import { registerEntities, seedDemoTenant, closeDb } from "@meridian/core";
import { allEntities } from "@meridian/entities";

async function main() {
  registerEntities(allEntities);
  const seeded = await seedDemoTenant();
  if (seeded) {
    console.log("Seed complete:");
    console.log("  Tenant: Demo Company (slug: demo)");
    console.log("  Login: admin@demo.com / demo1234");
  } else {
    console.log("Demo tenant already exists, skipping seed");
  }
  await closeDb();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
