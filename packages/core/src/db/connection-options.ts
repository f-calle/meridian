import type { Options } from "postgres";

/**
 * Shared connection settings for both pools.
 *
 * `max` matters on hosted Postgres, where the connection cap is low and shared:
 * an unbounded pool per instance is how a deploy ends up unable to open a
 * connection at all. `onnotice` is silenced because every boot used to print a
 * wall of "relation already exists, skipping" notices that buried real errors.
 */
export function baseConnectionOptions(): Options<Record<string, never>> {
  return {
    max: Number(process.env.MERIDIAN_DB_POOL_MAX ?? 10),
    idle_timeout: Number(process.env.MERIDIAN_DB_IDLE_TIMEOUT_S ?? 30),
    connect_timeout: Number(process.env.MERIDIAN_DB_CONNECT_TIMEOUT_S ?? 10),
    onnotice: () => {},
  };
}

/**
 * Statement timeout for the request path.
 *
 * Applied to the raw-SQL pool only — that pool serves entity CRUD, which is
 * where user input reaches the query planner and where a pathological filter
 * can pin a connection indefinitely. The drizzle pool deliberately has none: it
 * runs migrations, and an index build on a large table is allowed to take as
 * long as it takes.
 */
export function statementTimeoutMs(): number {
  return Number(process.env.MERIDIAN_STATEMENT_TIMEOUT_MS ?? 30_000);
}
