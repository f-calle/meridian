import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { registerEntities, getDb, closeDb } from "@meridian/core";
import { allEntities } from "@meridian/entities";

async function seed() {
  registerEntities(allEntities);
  const db = getDb();

  const existing = await db.execute(sql`SELECT id FROM tenants WHERE slug = 'demo' LIMIT 1`);
  if (existing.length > 0) {
    console.log("Demo tenant already exists, skipping seed");
    await closeDb();
    return;
  }

  const tenantResult = await db.execute(sql`
    INSERT INTO tenants (name, slug) VALUES ('Demo Company', 'demo') RETURNING id
  `);
  const tenantId = (tenantResult[0] as { id: string }).id;

  const passwordHash = createHash("sha256").update("demo1234").digest("hex");
  await db.execute(sql`
    INSERT INTO users (tenant_id, email, name, role, password_hash)
    VALUES (${tenantId}, 'admin@demo.com', 'Demo Admin', 'admin', ${passwordHash})
  `);

  console.log("Seed complete:");
  console.log("  Tenant: Demo Company (slug: demo)");
  console.log("  Login: admin@demo.com / demo1234");
  await closeDb();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
