import type { ActorContext, EntityDefinition, PermissionMatrix } from "../types.js";

export type CrudAction = "create" | "read" | "update" | "delete";

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}

export function checkPermission(
  entity: EntityDefinition,
  actor: ActorContext,
  action: CrudAction,
): void {
  const rolePerms = actor.permissions?.[entity.name] ?? entity.permissions[actor.role];

  if (!rolePerms) {
    throw new PermissionError(`Role "${actor.role}" has no permissions for entity "${entity.name}"`);
  }

  if (!rolePerms[action]) {
    throw new PermissionError(`Role "${actor.role}" cannot ${action} ${entity.name}`);
  }
}

export function getEffectivePermissions(
  entity: EntityDefinition,
  actor: ActorContext,
): PermissionMatrix {
  return actor.permissions?.[entity.name] ?? entity.permissions[actor.role] ?? {
    create: false,
    read: false,
    update: false,
    delete: false,
  };
}

export function assertTenantAccess(recordTenantId: string, actorTenantId: string): void {
  if (recordTenantId !== actorTenantId) {
    throw new PermissionError("Access denied: tenant mismatch");
  }
}
