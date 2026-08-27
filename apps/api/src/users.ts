import type { App, AppContext } from "./app-env.js";
import { sql } from "drizzle-orm";
import { getDb, hashPassword, verifyPassword } from "@meridian/core";
import type { ActorContext } from "@meridian/core";

const ASSIGNABLE_ROLES = new Set(["admin", "sales", "member"]);

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
}

/** Team management (admin-only) + self-service password change. */
export function registerUserRoutes(
  app: App,
  getActor: (c: AppContext) => ActorContext | null,
): void {
  app.get("/api/users", async (c) => {
    const actor = getActor(c);
    if (!actor) return c.json({ error: "Unauthorized" }, 401);
    if (actor.role !== "admin") return c.json({ error: "Admin access required" }, 403);

    const db = getDb();
    const rows = (await db.execute(sql`
      SELECT id, email, name, role, created_at FROM users
      WHERE tenant_id = ${actor.tenantId}
      ORDER BY created_at ASC
    `)) as unknown as UserRow[];

    return c.json({
      users: rows.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        createdAt: u.created_at,
      })),
    });
  });

  app.post("/api/users", async (c) => {
    const actor = getActor(c);
    if (!actor) return c.json({ error: "Unauthorized" }, 401);
    if (actor.role !== "admin") return c.json({ error: "Admin access required" }, 403);

    let body: { email?: string; name?: string; role?: string; password?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const email = body.email?.trim().toLowerCase();
    const name = body.name?.trim();
    const role = body.role ?? "member";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ error: "A valid email is required" }, 400);
    }
    if (!name) return c.json({ error: "Name is required" }, 400);
    if (!ASSIGNABLE_ROLES.has(role)) {
      return c.json({ error: `Role must be one of: ${[...ASSIGNABLE_ROLES].join(", ")}` }, 400);
    }
    if (!body.password || body.password.length < 8) {
      return c.json({ error: "Password must be at least 8 characters" }, 400);
    }

    const db = getDb();
    const existing = await db.execute(sql`
      SELECT id FROM users WHERE tenant_id = ${actor.tenantId} AND email = ${email} LIMIT 1
    `);
    if (existing.length > 0) {
      return c.json({ error: "A user with that email already exists" }, 409);
    }

    const passwordHash = hashPassword(body.password);
    const result = await db.execute(sql`
      INSERT INTO users (tenant_id, email, name, role, password_hash)
      VALUES (${actor.tenantId}, ${email}, ${name}, ${role}, ${passwordHash})
      RETURNING id, email, name, role, created_at
    `);
    const u = result[0] as unknown as UserRow;
    return c.json({ id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.created_at }, 201);
  });

  app.post("/api/users/:id/role", async (c) => {
    const actor = getActor(c);
    if (!actor) return c.json({ error: "Unauthorized" }, 401);
    if (actor.role !== "admin") return c.json({ error: "Admin access required" }, 403);

    const userId = c.req.param("id");
    let body: { role?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    if (!body.role || !ASSIGNABLE_ROLES.has(body.role)) {
      return c.json({ error: `Role must be one of: ${[...ASSIGNABLE_ROLES].join(", ")}` }, 400);
    }

    const db = getDb();
    // Never demote the last admin
    if (body.role !== "admin") {
      const admins = await db.execute(sql`
        SELECT id FROM users WHERE tenant_id = ${actor.tenantId} AND role = 'admin'
      `);
      const adminIds = (admins as unknown as { id: string }[]).map((a) => a.id);
      if (adminIds.length === 1 && adminIds[0] === userId) {
        return c.json({ error: "Cannot demote the only admin" }, 400);
      }
    }

    const result = await db.execute(sql`
      UPDATE users SET role = ${body.role}, updated_at = NOW()
      WHERE id = ${userId}::uuid AND tenant_id = ${actor.tenantId}
      RETURNING id
    `);
    if (result.length === 0) return c.json({ error: "User not found" }, 404);
    return c.json({ success: true });
  });

  app.delete("/api/users/:id", async (c) => {
    const actor = getActor(c);
    if (!actor) return c.json({ error: "Unauthorized" }, 401);
    if (actor.role !== "admin") return c.json({ error: "Admin access required" }, 403);

    const userId = c.req.param("id");
    if (userId === actor.id) return c.json({ error: "You cannot remove your own account" }, 400);

    const db = getDb();
    const result = await db.execute(sql`
      DELETE FROM users WHERE id = ${userId}::uuid AND tenant_id = ${actor.tenantId}
      RETURNING id
    `);
    if (result.length === 0) return c.json({ error: "User not found" }, 404);
    return c.json({ success: true });
  });

  app.post("/api/auth/change-password", async (c) => {
    const actor = getActor(c);
    if (!actor) return c.json({ error: "Unauthorized" }, 401);

    let body: { currentPassword?: string; newPassword?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    if (!body.currentPassword || !body.newPassword) {
      return c.json({ error: "currentPassword and newPassword are required" }, 400);
    }
    if (body.newPassword.length < 8) {
      return c.json({ error: "New password must be at least 8 characters" }, 400);
    }

    const db = getDb();
    const rows = await db.execute(sql`
      SELECT password_hash FROM users WHERE id = ${actor.id}::uuid AND tenant_id = ${actor.tenantId} LIMIT 1
    `);
    const row = rows[0] as unknown as { password_hash: string } | undefined;
    if (!row || !verifyPassword(body.currentPassword, row.password_hash)) {
      return c.json({ error: "Current password is incorrect" }, 403);
    }

    await db.execute(sql`
      UPDATE users SET password_hash = ${hashPassword(body.newPassword)}, updated_at = NOW()
      WHERE id = ${actor.id}::uuid
    `);
    return c.json({ success: true });
  });
}
