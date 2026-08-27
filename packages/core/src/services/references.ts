import type { ActorContext, EntityDefinition } from "../types.js";
import { entityRegistry } from "../entity/registry.js";
import { toColumnName } from "../db/naming.js";
import { getSql } from "../db/raw-sql.js";

/**
 * Relation fields hold the id of another record, but nothing stopped a record
 * from being deleted while others still pointed at it — the referring rows kept
 * a dead uuid, and the UI rendered a company name that no longer resolved.
 *
 * Deletes are now checked first. Blocking is the default because it is what an
 * ERP user expects ("3 contacts are still linked to this company"); detaching
 * is available for when they really do mean to clear the links.
 */

export interface Reference {
  /** Entity holding the pointer, e.g. "contact" */
  entity: string;
  /** Relation field on that entity, e.g. "companyId" */
  field: string;
  count: number;
}

export class ReferentialIntegrityError extends Error {
  override name = "ReferentialIntegrityError";
  constructor(
    readonly entityName: string,
    readonly recordId: string,
    readonly references: Reference[],
  ) {
    super(describeReferences(entityName, references));
  }
}

/** True for referential-integrity refusals, across realm boundaries. */
export function isReferentialIntegrityError(err: unknown): boolean {
  return (
    err instanceof ReferentialIntegrityError || (err as Error)?.name === "ReferentialIntegrityError"
  );
}

function plural(entity: EntityDefinition | undefined, count: number, fallback: string): string {
  if (!entity) return `${count} ${fallback}`;
  const label = count === 1 ? entity.label : (entity.pluralLabel ?? `${entity.label}s`);
  return `${count} ${label.toLowerCase()}`;
}

export function describeReferences(entityName: string, references: Reference[]): string {
  const subject = entityRegistry.get(entityName);
  const parts = references.map((r) => plural(entityRegistry.get(r.entity), r.count, r.entity));
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return (
    `Cannot delete this ${(subject?.label ?? entityName).toLowerCase()} — ` +
    `${list} still link to it. Reassign them first, or delete with detach to clear the links.`
  );
}

/** Every relation field on any registered entity that points at `entityName`. */
export function inboundRelations(entityName: string): { entity: string; field: string }[] {
  const inbound: { entity: string; field: string }[] = [];
  for (const entity of entityRegistry.list()) {
    for (const [fieldName, fieldDef] of Object.entries(entity.fields)) {
      if (fieldDef.type === "relation" && fieldDef.relation === entityName) {
        inbound.push({ entity: entity.name, field: fieldName });
      }
    }
  }
  return inbound;
}

/** Count the records pointing at `id`, within the actor's tenant. */
export async function findReferences(
  entityName: string,
  id: string,
  actor: ActorContext,
): Promise<Reference[]> {
  const inbound = inboundRelations(entityName);
  if (inbound.length === 0) return [];

  const sql = getSql();
  const found: Reference[] = [];
  for (const { entity, field } of inbound) {
    // Entity and column names come from the registry, never from a request.
    const rows = await sql.unsafe<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM ${entity} WHERE ${toColumnName(field)} = $1 AND tenant_id = $2`,
      [id, actor.tenantId],
    );
    const count = Number(rows[0]?.count ?? 0);
    if (count > 0) found.push({ entity, field, count });
  }
  return found;
}

/** Null out every pointer at `id`. Returns what was cleared. */
export async function detachReferences(
  entityName: string,
  id: string,
  actor: ActorContext,
): Promise<Reference[]> {
  const references = await findReferences(entityName, id, actor);
  const sql = getSql();
  for (const reference of references) {
    await sql.unsafe(
      `UPDATE ${reference.entity} SET ${toColumnName(reference.field)} = NULL, updated_at = NOW()
       WHERE ${toColumnName(reference.field)} = $1 AND tenant_id = $2`,
      [id, actor.tenantId],
    );
  }
  return references;
}
