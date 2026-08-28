import type { EntityDefinition } from "../types.js";

/**
 * Comparison filters.
 *
 * `list()` originally only matched a field to a literal, which is enough to ask
 * "deals in the proposal stage" and useless for the questions a working ERP
 * actually asks: what is overdue, what expires this week, what has not been
 * touched in a month. Those need comparisons, so filter values may now be
 * `{ op, value }` instead of a bare literal.
 *
 * A bare literal still means equality, so every existing caller is unchanged —
 * including the ones matching an `externalId` like `quote:<uuid>`, which is why
 * operators are never parsed out of the value itself.
 *
 * A field may carry an array of conditions, which AND together: a date range
 * needs both a lower and an upper bound on the same column.
 */

export const FILTER_OPS = [
  "eq",
  "ne",
  "lt",
  "lte",
  "gt",
  "gte",
  "contains",
  "in",
  "nin",
  "null",
  "notnull",
] as const;

export type FilterOp = (typeof FILTER_OPS)[number];

export interface FilterCondition {
  op: FilterOp;
  value?: unknown;
}

export function isFilterOp(value: string): value is FilterOp {
  return (FILTER_OPS as readonly string[]).includes(value);
}

function isCondition(value: unknown): value is FilterCondition {
  return (
    typeof value === "object" &&
    value !== null &&
    "op" in value &&
    typeof (value as FilterCondition).op === "string" &&
    isFilterOp((value as FilterCondition).op)
  );
}

/** SQL comparison operators, keyed by filter op. Never built from user input. */
const SQL_OP: Record<string, string> = {
  eq: "=",
  ne: "<>",
  lt: "<",
  lte: "<=",
  gt: ">",
  gte: ">=",
};

export interface CompiledFilters {
  /** SQL fragment to AND onto a WHERE clause, or "" when there is nothing to add. */
  clause: string;
  /** Values for the placeholders in `clause`, in order. */
  params: unknown[];
}

/**
 * Compile filters into a parameterised SQL fragment.
 *
 * `resolveColumn` is passed in so the caller keeps ownership of what counts as a
 * valid column: every column name here comes from the entity definition, never
 * from the request, and every value goes through a placeholder.
 *
 * `startIndex` is the number of placeholders already used by the caller, so the
 * fragment numbers its own from there.
 */
export function compileFilters(
  entity: EntityDefinition,
  filters: Record<string, unknown>,
  resolveColumn: (entity: EntityDefinition, fieldName: string) => string | null,
  startIndex: number,
): CompiledFilters {
  const parts: string[] = [];
  const params: unknown[] = [];
  let next = startIndex;

  for (const [fieldName, raw] of Object.entries(filters)) {
    if (raw === undefined) continue;

    const column = resolveColumn(entity, fieldName);
    if (!column) throw new Error(`Unknown filter field: ${fieldName}`);

    // An array of conditions ANDs together (a date range); an array anywhere
    // else is the value of an `in`, which arrives already wrapped.
    const conditions: FilterCondition[] =
      Array.isArray(raw) && raw.every(isCondition)
        ? (raw as FilterCondition[])
        : [
            isCondition(raw)
              ? raw
              : { op: raw === null ? "null" : "eq", value: raw },
          ];

    for (const condition of conditions) {
      switch (condition.op) {
        case "null":
          parts.push(`${column} IS NULL`);
          break;

        case "notnull":
          parts.push(`${column} IS NOT NULL`);
          break;

        case "contains":
          parts.push(`${column} ILIKE $${++next}`);
          params.push(`%${String(condition.value ?? "")}%`);
          break;

        case "in":
        case "nin": {
          const values = Array.isArray(condition.value)
            ? condition.value
            : [condition.value];
          if (values.length === 0) {
            // An empty "in" matches nothing and an empty "not in" matches
            // everything. Saying so explicitly beats emitting `IN ()`, which is a
            // syntax error rather than an empty result.
            parts.push(condition.op === "in" ? "FALSE" : "TRUE");
            break;
          }
          const placeholders = values.map(() => `$${++next}`).join(", ");
          parts.push(
            `${column} ${condition.op === "nin" ? "NOT IN" : "IN"} (${placeholders})`,
          );
          params.push(...values);
          break;
        }

        default: {
          // `ne` has to survive NULLs: `status <> 'paid'` silently drops rows
          // where status is null, which is exactly the unsent invoice you were
          // looking for.
          const sqlOp = SQL_OP[condition.op];
          if (condition.value === null) {
            parts.push(
              condition.op === "ne"
                ? `${column} IS NOT NULL`
                : `${column} IS NULL`,
            );
            break;
          }
          if (condition.op === "ne") {
            parts.push(`(${column} IS NULL OR ${column} <> $${++next})`);
          } else {
            parts.push(`${column} ${sqlOp} $${++next}`);
          }
          params.push(condition.value);
        }
      }
    }
  }

  return {
    clause: parts.length > 0 ? ` AND ${parts.join(" AND ")}` : "",
    params,
  };
}

/**
 * Parse `filter.<field>` and `filter.<field>.<op>` query parameters.
 *
 * The operator lives in the key, never the value: a value like
 * `quote:2f1c…` is a legitimate external id, and splitting it on a colon would
 * quietly turn one into a malformed operator.
 */
export function parseFilterParams(
  query: Record<string, string>,
): Record<string, unknown> {
  const filters: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(query)) {
    if (!key.startsWith("filter.")) continue;
    const path = key.slice("filter.".length);
    if (!path) continue;

    const dot = path.indexOf(".");
    if (dot === -1) {
      filters[path] = value;
      continue;
    }

    const field = path.slice(0, dot);
    const op = path.slice(dot + 1);
    if (!field || !isFilterOp(op)) {
      throw new Error(`Unknown filter operator in "${key}"`);
    }
    filters[field] =
      op === "in" || op === "nin"
        ? { op, value: value.split(",") }
        : { op, value };
  }

  return filters;
}
