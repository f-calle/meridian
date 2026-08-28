import type { ActorContext, EntityDefinition, PermissionMatrix } from "../types.js";
import { defaultAccess } from "./roles.js";

export type CrudAction = "create" | "read" | "update" | "delete";

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}

/** True for ACL denials, regardless of message wording or realm boundaries. */
export function isPermissionError(err: unknown): boolean {
  return err instanceof PermissionError || (err as Error)?.name === "PermissionError";
}

/**
 * What an actor may do to an entity.
 *
 * Resolution order:
 *
 *  1. The entity's own `permissions` map, when it declares this role — an
 *     explicit, reviewed exception to the default.
 *  2. The central role table, keyed by the entity's class.
 *  3. Nothing.
 *
 * An actor-scoped override is then applied as a CEILING, never a grant. It used
 * to sit at the front of that list and win outright, so anything that could put
 * a permission map on an actor could hand itself rights its role did not have —
 * and nothing validated or bounded it. Narrowing-only makes it safe to feed
 * from a stored API key.
 */
function baseAccess(entity: EntityDefinition, role: string): PermissionMatrix {
  // hasOwn, not a bare lookup: a role named "constructor" or "toString" would
  // otherwise resolve to something inherited from Object.prototype.
  if (entity.permissions && Object.hasOwn(entity.permissions, role)) {
    return entity.permissions[role]!;
  }
  return defaultAccess(role, entity.sensitivity);
}

/** Intersect two matrices — every action must be allowed by both. */
function narrow(base: PermissionMatrix, ceiling: PermissionMatrix): PermissionMatrix {
  return {
    create: base.create && ceiling.create,
    read: base.read && ceiling.read,
    update: base.update && ceiling.update,
    delete: base.delete && ceiling.delete,
  };
}

export function getEffectivePermissions(
  entity: EntityDefinition,
  actor: ActorContext,
): PermissionMatrix {
  const base = baseAccess(entity, actor.role);
  const ceiling = actor.permissions?.[entity.name];
  return ceiling ? narrow(base, ceiling) : base;
}

export function checkPermission(
  entity: EntityDefinition,
  actor: ActorContext,
  action: CrudAction,
): void {
  if (!getEffectivePermissions(entity, actor)[action]) {
    throw new PermissionError(`Role "${actor.role}" cannot ${action} ${entity.name}`);
  }
}

export function assertTenantAccess(recordTenantId: string, actorTenantId: string): void {
  if (recordTenantId !== actorTenantId) {
    throw new PermissionError("Access denied: tenant mismatch");
  }
}
