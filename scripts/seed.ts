import { sql } from "drizzle-orm";
import { registerEntities, getDb, closeDb, hashPassword } from "@meridian/core";
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

  const passwordHash = hashPassword("demo1234");
  await db.execute(sql`
    INSERT INTO users (tenant_id, email, name, role, password_hash)
    VALUES (${tenantId}, 'admin@demo.com', 'Demo Admin', 'admin', ${passwordHash})
  `);

  // Demo automation: winning a deal spins up a delivery project automatically
  await db.execute(sql`
    INSERT INTO automation (tenant_id, name, entity, event, conditions, actions, enabled)
    VALUES (
      ${tenantId},
      'Won deal → kickoff project',
      'deal',
      'updated',
      ${JSON.stringify([{ field: "stage", op: "eq", value: "won" }])}::jsonb,
      ${JSON.stringify([
        {
          type: "create_record",
          entity: "project",
          data: { name: "Delivery: {{title}}", status: "planning", description: "Auto-created from won deal {{recordId}}" },
        },
      ])}::jsonb,
      true
    )
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
