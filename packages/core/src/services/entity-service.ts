import { v4 as uuidv4 } from "uuid";
import type { ActorContext, EntityDefinition, ListQuery, ListResult } from "../types.js";
import { entityRegistry } from "../entity/registry.js";
import { validateEntityData } from "../entity/validation.js";
import { checkPermission } from "../acl/permissions.js";
import { hookRegistry } from "../events/event-bus.js";
import { getDb } from "../db/client.js";
import { auditLog } from "../db/schema.js";
import { getSql } from "../db/raw-sql.js";
import { ensureEntityTables } from "../db/entity-store.js";

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

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
    const dbData = mapFieldsToDb(entity, validation.data);
    const columns = ["id", "tenant_id", ...Object.keys(dbData).map(toSnakeCase)];
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

    const dbData = mapFieldsToDb(entity, validation.data, { applyDefaults: false });
    const entries = Object.entries(dbData);
    if (entries.length > 0) {
      const setClauses = entries.map(([k], i) => `${toSnakeCase(k)} = $${i + 3}`).join(", ");
      await getSql().unsafe(
        `UPDATE ${entityName} SET ${setClauses}, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
        [id, actor.tenantId, ...entries.map(([, v]) => v)] as (string | number | boolean | null)[],
      );
    }

    const diff = computeDiff(existing, validation.data);
    await this.writeAudit(actor, entityName, id, "update", diff);
    const merged = { ...existing, ...validation.data };
    await hookRegistry.runLifecycle(entityName, "onUpdate", {
      entityName,
      recordId: id,
      data: merged,
      changes: validation.data,
      actor,
      tenantId: actor.tenantId,
    });

    return merged;
  }

  async delete(entityName: string, id: string, actor: ActorContext): Promise<void> {
    const entity = this.getEntity(entityName);
    checkPermission(entity, actor, "delete");
    await this.read(entityName, id, actor);

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
        .map(([name]) => `${toSnakeCase(name)} ILIKE $${params.length + 1}`);
      if (searchFields.length > 0) {
        whereClause += ` AND (${searchFields.join(" OR ")})`;
        params.push(`%${query.search}%`);
      }
    }

    if (query.filters) {
      for (const [fieldName, value] of Object.entries(query.filters)) {
        if (value === undefined) continue;
        const col = resolveColumn(entity, fieldName);
        if (!col) throw new Error(`Unknown filter field: ${fieldName}`);
        if (value === null) {
          whereClause += ` AND ${col} IS NULL`;
        } else {
          whereClause += ` AND ${col} = $${params.length + 1}`;
          params.push(value);
        }
      }
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
      metric?: "count" | "sum" | "avg";
      metricField?: string;
      filters?: Record<string, unknown>;
    },
    actor: ActorContext,
  ): Promise<{ group: string | null; count: number; value: number | null }[]> {
    const entity = this.getEntity(entityName);
    checkPermission(entity, actor, "read");

    const metric = options.metric ?? "count";
    let metricExpr = "NULL";
    if (metric !== "count") {
      if (!options.metricField) throw new Error(`Metric "${metric}" requires metricField`);
      const def = entity.fields[options.metricField];
      if (!def || (def.type !== "number" && def.type !== "currency")) {
        throw new Error(`Field "${options.metricField}" is not numeric`);
      }
      metricExpr = `${metric.toUpperCase()}(${toSnakeCase(options.metricField)})::float`;
    }

    let whereClause = "tenant_id = $1";
    const params: unknown[] = [actor.tenantId];
    if (options.filters) {
      for (const [fieldName, value] of Object.entries(options.filters)) {
        if (value === undefined) continue;
        const col = resolveColumn(entity, fieldName);
        if (!col) throw new Error(`Unknown filter field: ${fieldName}`);
        if (value === null) {
          whereClause += ` AND ${col} IS NULL`;
        } else {
          whereClause += ` AND ${col} = $${params.length + 1}`;
          params.push(value);
        }
      }
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
  ): Promise<Record<string, unknown>> {
    const entity = this.getEntity(entityName);
    if (!entity.externalId) throw new Error(`Entity "${entityName}" does not support external IDs`);

    const existing = await getSql().unsafe(
      `SELECT id FROM ${entityName} WHERE tenant_id = $1 AND external_id = $2 AND source_system = $3 LIMIT 1`,
      [actor.tenantId, externalId, sourceSystem],
    );

    if (existing[0]) {
      return this.update(entityName, String((existing[0] as Record<string, unknown>).id), data, actor);
    }

    return this.create(entityName, { ...data, externalId, sourceSystem }, actor);
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

/** Resolve a user-supplied field name to a safe column name, or null if unknown. */
function resolveColumn(entity: EntityDefinition, fieldName: string): string | null {
  if (entity.fields[fieldName]) return toSnakeCase(fieldName);
  const snake = toSnakeCase(fieldName);
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
      result[camelKey] = value;
    }
  }
  return result;
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
