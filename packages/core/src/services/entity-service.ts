import { v4 as uuidv4 } from "uuid";
import type { ActorContext, EntityDefinition, FieldType, ListQuery, ListResult } from "../types.js";
import { entityRegistry } from "../entity/registry.js";
import { validateEntityData } from "../entity/validation.js";
import { checkPermission } from "../acl/permissions.js";
import { hookRegistry } from "../events/event-bus.js";
import { getDb } from "../db/client.js";
import { auditLog } from "../db/schema.js";
import { getSql } from "../db/raw-sql.js";
import { ensureEntityTables } from "../db/entity-store.js";
import { toColumnName } from "../db/naming.js";
import { compileFilters } from "./filters.js";
import { detachReferences, findReferences, ReferentialIntegrityError } from "./references.js";

export class EntityService {
  constructor() {
    ensureEntityTables();
  }

  async create(
    entityName: string,
    data: Record<string, unknown>,
    actor: ActorContext,
  ): Promise<Record<string, unknown>> {
    const entity = this.getEntity(entityName);
    checkPermission(entity, actor, "create");

    const validation = validateEntityData(entity, data);
    if (!validation.success) {
      throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
    }

    const id = uuidv4();
    // externalId/sourceSystem aren't declared entity fields, so zod strips
    // them from validation.data — carry them across from the raw input or
    // idempotent re-imports would silently duplicate.
    const dbData = mapFieldsToDb(entity, withExternalIdentity(validation.data, data));
    const columns = ["id", "tenant_id", ...Object.keys(dbData).map(toColumnName)];
    const values = [id, actor.tenantId, ...Object.values(dbData)];
    const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");

    await getSql().unsafe(
      `INSERT INTO ${entityName} (${columns.join(", ")}, created_at, updated_at) VALUES (${placeholders}, NOW(), NOW())`,
      values as (string | number | boolean | null | Date)[],
    );

    await this.writeAudit(actor, entityName, id, "create", validation.data);
    await hookRegistry.runLifecycle(entityName, "onCreate", {
      entityName,
      recordId: id,
      data: validation.data,
      actor,
      tenantId: actor.tenantId,
    });

    return { id, ...validation.data };
  }

  async read(entityName: string, id: string, actor: ActorContext): Promise<Record<string, unknown>> {
    const entity = this.getEntity(entityName);
    checkPermission(entity, actor, "read");

    const rows = await getSql().unsafe(
      `SELECT * FROM ${entityName} WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [id, actor.tenantId],
    );

    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new Error(`Record not found: ${entityName}/${id}`);
    return mapDbToFields(entity, row);
  }

  async update(
    entityName: string,
    id: string,
    data: Record<string, unknown>,
    actor: ActorContext,
  ): Promise<Record<string, unknown>> {
    const entity = this.getEntity(entityName);
    checkPermission(entity, actor, "update");

    const existing = await this.read(entityName, id, actor);
    const validation = validateEntityData(entity, data, true);
    if (!validation.success) {
      throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
    }

    const dbData = mapFieldsToDb(entity, withExternalIdentity(validation.data, data), {
      applyDefaults: false,
    });
    const entries = Object.entries(dbData);
    if (entries.length > 0) {
      const setClauses = entries.map(([k], i) => `${toColumnName(k)} = $${i + 3}`).join(", ");
      await getSql().unsafe(
        `UPDATE ${entityName} SET ${setClauses}, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
        [id, actor.tenantId, ...entries.map(([, v]) => v)] as (string | number | boolean | null)[],
      );
    }

    const diff = computeDiff(existing, validation.data);
    await this.writeAudit(actor, entityName, id, "update", diff);
    const merged = { ...existing, ...validation.data };
    // `changes` must be the fields whose VALUE changed — not every field the
    // caller sent. The detail page saves the whole record, so using the
    // payload re-fired conditioned automations on unrelated edits.
    const changed = Object.fromEntries(Object.keys(diff).map((k) => [k, merged[k]]));
    await hookRegistry.runLifecycle(entityName, "onUpdate", {
      entityName,
      recordId: id,
      data: merged,
      changes: changed,
      actor,
      tenantId: actor.tenantId,
    });

    return merged;
  }

  /**
   * Delete a record.
   *
   * Refuses when other records still point at it, so a deleted company can't
   * leave contacts and deals holding a uuid that resolves to nothing. Pass
   * `{ detach: true }` to clear those links instead — the caller has to say so.
   */
  async delete(
    entityName: string,
    id: string,
    actor: ActorContext,
    options: { detach?: boolean } = {},
  ): Promise<void> {
    const entity = this.getEntity(entityName);
    checkPermission(entity, actor, "delete");
    await this.read(entityName, id, actor);

    if (options.detach) {
      await detachReferences(entityName, id, actor);
    } else {
      const references = await findReferences(entityName, id, actor);
      if (references.length > 0) {
        throw new ReferentialIntegrityError(entityName, id, references);
      }
    }

    await getSql().unsafe(
      `DELETE FROM ${entityName} WHERE id = $1 AND tenant_id = $2`,
      [id, actor.tenantId],
    );

    await this.writeAudit(actor, entityName, id, "delete", null);
    await hookRegistry.runLifecycle(entityName, "onDelete", {
      entityName,
      recordId: id,
      data: {},
      actor,
      tenantId: actor.tenantId,
    });
  }

  async list(
    entityName: string,
    query: ListQuery,
    actor: ActorContext,
  ): Promise<ListResult<Record<string, unknown>>> {
    const entity = this.getEntity(entityName);
    checkPermission(entity, actor, "read");

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    let whereClause = "tenant_id = $1";
    const params: unknown[] = [actor.tenantId];

    if (query.search) {
      const searchFields = Object.entries(entity.fields)
        .filter(([, def]) => def.searchable)
        .map(([name]) => `${toColumnName(name)} ILIKE $${params.length + 1}`);
      if (searchFields.length > 0) {
        whereClause += ` AND (${searchFields.join(" OR ")})`;
        params.push(`%${query.search}%`);
      }
    }

    if (query.filters) {
      const compiled = compileFilters(entity, query.filters, resolveColumn, params.length);
      whereClause += compiled.clause;
      params.push(...compiled.params);
    }

    const sortCol = query.sortBy ? resolveColumn(entity, query.sortBy) : "created_at";
    if (!sortCol) throw new Error(`Unknown sort field: ${query.sortBy}`);
    const sortOrder = query.sortOrder === "asc" ? "ASC" : "DESC";

    const [rows, countResult] = await Promise.all([
      getSql().unsafe(
        `SELECT * FROM ${entityName} WHERE ${whereClause} ORDER BY ${sortCol} ${sortOrder} LIMIT ${pageSize} OFFSET ${offset}`,
        params as (string | number)[],
      ),
      getSql().unsafe(
        `SELECT COUNT(*)::int as count FROM ${entityName} WHERE ${whereClause}`,
        params as (string | number)[],
      ),
    ]);

    return {
      data: (rows as Record<string, unknown>[]).map((row) => mapDbToFields(entity, row)),
      total: Number((countResult[0] as Record<string, unknown>)?.count ?? 0),
      page,
      pageSize,
    };
  }

  /**
   * Aggregate records: count (and optionally sum/avg a numeric field),
   * grouped by an optional field. All field names are validated against
   * the entity definition before touching SQL.
   */
  async aggregate(
    entityName: string,
    options: {
      groupBy?: string;
      metric?: "count" | "sum" | "avg" | "weighted_sum";
      metricField?: string;
      /** Percentage field weighting a weighted_sum, e.g. a deal's probability. */
      weightField?: string;
      filters?: Record<string, unknown>;
    },
    actor: ActorContext,
  ): Promise<{ group: string | null; count: number; value: number | null }[]> {
    const entity = this.getEntity(entityName);
    checkPermission(entity, actor, "read");

    const metric = options.metric ?? "count";
    let metricExpr = "NULL";
    if (metric !== "count") {
      const numericColumn = (fieldName: string | undefined, role: string): string => {
        if (!fieldName) throw new Error(`Metric "${metric}" requires ${role}`);
        const def = entity.fields[fieldName];
        if (!def || (def.type !== "number" && def.type !== "currency")) {
          throw new Error(`Field "${fieldName}" is not numeric`);
        }
        return toColumnName(fieldName);
      };

      const valueCol = numericColumn(options.metricField, "metricField");
      if (metric === "weighted_sum") {
        // Weighting a pipeline by win probability is the difference between
        // "we have $2M in play" and "we can expect $600k" — the second is the
        // number anyone forecasting from this actually needs. COALESCE so a
        // deal with no probability contributes nothing rather than nulling the
        // whole sum.
        const weightCol = numericColumn(options.weightField, "weightField");
        metricExpr = `SUM(COALESCE(${valueCol}, 0) * COALESCE(${weightCol}, 0) / 100.0)::float`;
      } else {
        metricExpr = `${metric.toUpperCase()}(${valueCol})::float`;
      }
    }

    let whereClause = "tenant_id = $1";
    const params: unknown[] = [actor.tenantId];
    if (options.filters) {
      const compiled = compileFilters(entity, options.filters, resolveColumn, params.length);
      whereClause += compiled.clause;
      params.push(...compiled.params);
    }

    let groupCol: string | null = null;
    if (options.groupBy) {
      groupCol = resolveColumn(entity, options.groupBy);
      if (!groupCol) throw new Error(`Unknown groupBy field: ${options.groupBy}`);
    }

    const selectGroup = groupCol ? `${groupCol}::text as grp` : "NULL as grp";
    const groupClause = groupCol ? `GROUP BY ${groupCol} ORDER BY count DESC` : "";

    const rows = await getSql().unsafe(
      `SELECT ${selectGroup}, COUNT(*)::int as count, ${metricExpr} as value FROM ${entityName} WHERE ${whereClause} ${groupClause}`,
      params as (string | number)[],
    );

    return (rows as unknown as { grp: string | null; count: number; value: number | null }[]).map((r) => ({
      group: r.grp,
      count: r.count,
      value: r.value,
    }));
  }

  async upsertByExternalId(
    entityName: string,
    externalId: string,
    sourceSystem: string,
    data: Record<string, unknown>,
    actor: ActorContext,
  ): Promise<{ record: Record<string, unknown>; created: boolean }> {
    const entity = this.getEntity(entityName);
    if (!entity.externalId) throw new Error(`Entity "${entityName}" does not support external IDs`);

    const existing = await getSql().unsafe(
      `SELECT id FROM ${entityName} WHERE tenant_id = $1 AND external_id = $2 AND source_system = $3 LIMIT 1`,
      [actor.tenantId, externalId, sourceSystem],
    );

    if (existing[0]) {
      const record = await this.update(
        entityName,
        String((existing[0] as Record<string, unknown>).id),
        data,
        actor,
      );
      return { record, created: false };
    }

    const record = await this.create(entityName, { ...data, externalId, sourceSystem }, actor);
    return { record, created: true };
  }

  private getEntity(name: string): EntityDefinition {
    const entity = entityRegistry.get(name);
    if (!entity) throw new Error(`Unknown entity: ${name}`);
    return entity;
  }

  private async writeAudit(
    actor: ActorContext,
    entityName: string,
    recordId: string,
    action: "create" | "update" | "delete",
    diff: Record<string, unknown> | null,
  ): Promise<void> {
    await getDb().insert(auditLog).values({
      tenantId: actor.tenantId,
      entityName,
      recordId,
      action,
      actorId: actor.id,
      actorType: actor.type,
      diff,
    });
  }
}

const SYSTEM_COLUMNS = new Set(["id", "created_at", "updated_at", "external_id", "source_system"]);

/** Re-attach external identity fields that entity validation strips out. */
function withExternalIdentity(
  validated: Record<string, unknown>,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...validated };
  if (raw.externalId !== undefined) result.externalId = raw.externalId;
  if (raw.sourceSystem !== undefined) result.sourceSystem = raw.sourceSystem;
  return result;
}

/** Resolve a user-supplied field name to a safe column name, or null if unknown. */
function resolveColumn(entity: EntityDefinition, fieldName: string): string | null {
  if (entity.fields[fieldName]) return toColumnName(fieldName);
  const snake = toColumnName(fieldName);
  if (SYSTEM_COLUMNS.has(snake)) return snake;
  return null;
}

function mapFieldsToDb(
  entity: EntityDefinition,
  data: Record<string, unknown>,
  options: { applyDefaults?: boolean } = {},
): Record<string, unknown> {
  const applyDefaults = options.applyDefaults ?? true;
  const result: Record<string, unknown> = {};
  for (const [name, def] of Object.entries(entity.fields)) {
    if (data[name] !== undefined) result[name] = data[name];
    // Defaults only on create — applying them on update would reset every
    // omitted defaulted field.
    else if (applyDefaults && def.default !== undefined) result[name] = def.default;
  }
  if (data.externalId !== undefined) result.externalId = data.externalId;
  if (data.sourceSystem !== undefined) result.sourceSystem = data.sourceSystem;
  return result;
}

function mapDbToFields(entity: EntityDefinition, row: Record<string, unknown>): Record<string, unknown> {
  const snakeToCamel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    const camelKey = snakeToCamel(key);
    if (
      camelKey === "id" ||
      camelKey === "createdAt" ||
      camelKey === "updatedAt" ||
      camelKey === "tenantId" ||
      camelKey === "externalId" ||
      camelKey === "sourceSystem" ||
      entity.fields[camelKey] !== undefined
    ) {
      result[camelKey] = coerceFromDb(entity.fields[camelKey]?.type, value);
    }
  }
  return result;
}

/**
 * Postgres returns NUMERIC as a string (to preserve precision), so currency
 * and number fields would otherwise surface as "84000.00" — breaking
 * arithmetic and every currency formatter downstream. Coerce by field type.
 */
export function coerceFromDb(type: FieldType | undefined, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if ((type === "currency" || type === "number") && typeof value === "string") {
    const n = Number(value);
    return Number.isNaN(n) ? value : n;
  }
  return value;
}

function computeDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, unknown> {
  const diff: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    if (before[key] !== after[key]) {
      diff[key] = { from: before[key], to: after[key] };
    }
  }
  return diff;
}

export const entityService = new EntityService();
