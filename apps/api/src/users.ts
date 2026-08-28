import type { App, AppContext } from "./app-env.js";
import { sql } from "drizzle-orm";
import {
  getDb,
  hashPassword,
  verifyPassword,
  revokeSessions,
  forgetSession,
  ASSIGNABLE_ROLES,
  ROLES,
  hasCapability,
} from "@meridian/core";
import type { ActorContext } from "@meridian/core";

const ASSIGNABLE = new Set<string>(ASSIGNABLE_ROLES);

/**
 * Only an owner may create, remove or demote another owner.
 *
 * The tier exists for exactly this: without it any one admin can strip every
 * other administrator, which is a lockout with no recovery path.
 *
 * The exception is a workspace that has no owner at all — every tenant created
 * before this role existed. Someone has to be able to claim it, and the only
 * people there are admins, so an admin may appoint the first owner. Once one
 * exists the rule closes behind them.
 */
function canManage(actorRole: string, targetRole: string, tenantHasOwner: boolean): boolean {
  if (targetRole === "owner" && tenantHasOwner) return actorRole === "owner";
  return hasCapability(actorRole, "manage:users");
}

async function tenantHasOwner(tenantId: string): Promise<boolean> {
  const rows = await getDb().execute(
    sql`SELECT 1 FROM users WHERE tenant_id = ${tenantId}::uuid AND role = 'owner' LIMIT 1`,
  );
  return rows.length > 0;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
}

async function readUser(tenantId: string, userId: string): Promise<{ id: string; role: string } | null> {
  const rows = await getDb().execute(
    sql`SELECT id, role FROM users WHERE id = ${userId}::uuid AND tenant_id = ${tenantId}::uuid LIMIT 1`,
  );
  return (rows[0] as { id: string; role: string } | undefined) ?? null;
}

/**
 * Would changing this user's role to `nextRole` (or removing them, when null)
 * leave nobody able to administer the workspace?
 *
 * Counted over everyone who holds manage:users rather than over the literal
 * string "admin", so adding a role with that capability cannot silently
 * reintroduce the lockout.
 */
async function wouldStrandTenant(
  tenantId: string,
  userId: string,
  nextRole: string | null,
): Promise<boolean> {
  const rows = await getDb().execute(
    sql`SELECT id, role FROM users WHERE tenant_id = ${tenantId}::uuid`,
  );
  const users = rows as unknown as { id: string; role: string }[];
  const remaining = users.filter((u) =>
    u.id === userId
      ? nextRole !== null && hasCapability(nextRole, "manage:users")
      : hasCapability(u.role, "manage:users"),
  );
  return remaining.length === 0;
}

/** Team management + self-service password change. */
export function registerUserRoutes(
  app: App,
  getActor: (c: AppContext) => ActorContext | null,
): void {
  app.get("/api/users", async (c) => {
    const actor = getActor(c);
    if (!actor) return c.json({ error: "Unauthorized" }, 401);
    if (!hasCapability(actor.role, "manage:users")) {
      return c.json({ error: "Admin access required" }, 403);
    }

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
    if (!hasCapability(actor.role, "manage:users")) {
      return c.json({ error: "Admin access required" }, 403);
    }

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
    if (!ASSIGNABLE.has(role)) {
      return c.json({ error: `Role must be one of: ${[...ASSIGNABLE].join(", ")}` }, 400);
    }
    if (!canManage(actor.role, role, await tenantHasOwner(actor.tenantId))) {
      return c.json({ error: "Only an owner can add another owner" }, 403);
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
    if (!hasCapability(actor.role, "manage:users")) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const userId = c.req.param("id");
    let body: { role?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    if (!body.role || !ASSIGNABLE.has(body.role)) {
      return c.json({ error: `Role must be one of: ${[...ASSIGNABLE].join(", ")}` }, 400);
    }

    const db = getDb();
    const target = await readUser(actor.tenantId, userId!);
    if (!target) return c.json({ error: "User not found" }, 404);

    // Neither the target's current role nor the new one may exceed what the
    // actor is allowed to manage. Without the first check an admin could demote
    // an owner, which is the lockout the owner tier exists to prevent.
    const hasOwner = await tenantHasOwner(actor.tenantId);
    if (
      !canManage(actor.role, target.role, hasOwner) ||
      !canManage(actor.role, body.role, hasOwner)
    ) {
      return c.json({ error: "Only an owner can change an owner's role" }, 403);
    }
    if (await wouldStrandTenant(actor.tenantId, userId!, body.role)) {
      return c.json({ error: "That would leave the workspace with nobody who can administer it" }, 400);
    }

    const result = await db.execute(sql`
      UPDATE users SET role = ${body.role}, updated_at = NOW()
      WHERE id = ${userId}::uuid AND tenant_id = ${actor.tenantId}
      RETURNING id
    `);
    if (result.length === 0) return c.json({ error: "User not found" }, 404);

    // The old token still carries the old role, and the role is what the ACL
    // reads. Without this, a demoted admin keeps admin rights until their token
    // expires — up to a week.
    await revokeSessions(userId!);
    return c.json({ success: true });
  });

  app.delete("/api/users/:id", async (c) => {
    const actor = getActor(c);
    if (!actor) return c.json({ error: "Unauthorized" }, 401);
    if (!hasCapability(actor.role, "manage:users")) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const userId = c.req.param("id");
    if (userId === actor.id) return c.json({ error: "You cannot remove your own account" }, 400);

    const db = getDb();
    const target = await readUser(actor.tenantId, userId!);
    if (!target) return c.json({ error: "User not found" }, 404);

    // Deleting had no guard at all beyond self-deletion, so with two admins in
    // a workspace either could simply delete the other — the same lockout the
    // role endpoint guarded against, reachable one route over.
    if (!canManage(actor.role, target.role, await tenantHasOwner(actor.tenantId))) {
      return c.json({ error: "Only an owner can remove an owner" }, 403);
    }
    if (await wouldStrandTenant(actor.tenantId, userId!, null)) {
      return c.json({ error: "That would leave the workspace with nobody who can administer it" }, 400);
    }

    const result = await db.execute(sql`
      DELETE FROM users WHERE id = ${userId}::uuid AND tenant_id = ${actor.tenantId}
      RETURNING id
    `);
    if (result.length === 0) return c.json({ error: "User not found" }, 404);

    // The row is gone, so the session check will refuse the token; drop the
    // cached version too, or the removed user keeps working for a few seconds.
    forgetSession(userId!);
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
    // Changing a password is how someone responds to a session they think is
    // compromised, so it has to end the other sessions — including this one.
    // The client re-authenticates with the new password.
    await revokeSessions(actor.id);
    return c.json({ success: true, reauthenticate: true });
  });
}
