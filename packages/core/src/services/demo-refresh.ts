import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { tenants } from "../db/schema.js";
import { entityService } from "./entity-service.js";
import type { ActorContext } from "../types.js";

/**
 * Keep the demo tenant's day plausible.
 *
 * The seeded appointments are stamped at fixed hours of whatever day the seed
 * ran, so the home page's Today panel is full on day one and empty on day two —
 * which reads as a broken feature rather than a quiet morning. This moves those
 * records onto the current day, keeping the clock time each one already had.
 *
 * It is deliberately narrow. It only ever touches rows the seed marked as its
 * own, and only in a tenant named explicitly by configuration, because a job
 * that rewrites due dates on a schedule is exactly the kind of thing that must
 * not be one typo away from a real customer's calendar.
 */

/** Written to `sourceSystem` by the seed on records this may re-date. */
export const DEMO_SOURCE_SYSTEM = "demo-seed";

export interface DemoRefreshResult {
  activities: number;
  tasks: number;
}

/** A Date's calendar date in UTC, as YYYY-MM-DD. */
function utcDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * Move an instant onto `day`, keeping its clock time.
 *
 * The hour is read and rewritten in UTC on both sides, so a 09:00Z standup
 * stays 09:00Z rather than drifting an hour when the server's civil time
 * crosses a daylight-saving boundary.
 */
export function shiftInstantToDay(iso: string, day: Date): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const moved = new Date(day);
  moved.setUTCHours(at.getUTCHours(), at.getUTCMinutes(), 0, 0);
  return moved.toISOString();
}

/**
 * A stored date column as an ISO instant, whatever shape it arrives in.
 *
 * The Postgres driver hands back a `Date`, so comparing `String(row.dueDate)`
 * to an ISO string never matched — every run rewrote every record and wrote an
 * audit entry for each, forever. Normalising both sides is what makes the
 * nightly job a no-op on a day it has already done.
 */
export function toIsoInstant(value: unknown): string | null {
  if (!value) return null;
  const at = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/** The id of the tenant with this slug, or null when there is no such tenant. */
export async function findTenantIdBySlug(slug: string): Promise<string | null> {
  const rows = await getDb().select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug));
  return rows[0]?.id ?? null;
}

/** A system actor scoped to one tenant, for work no user asked for. */
function demoActor(tenantId: string): ActorContext {
  return { id: "demo-refresh", type: "system", tenantId, role: "admin" };
}

/** Every record in this tenant that the seed marked as its own. */
async function seededRecords(
  entity: string,
  actor: ActorContext,
): Promise<Record<string, unknown>[]> {
  const result = await entityService.list(
    entity,
    {
      tenantId: actor.tenantId,
      pageSize: 200,
      filters: { sourceSystem: { op: "eq", value: DEMO_SOURCE_SYSTEM } },
    },
    actor,
  );
  return result.data;
}

/** Re-date the seeded activities, preserving each one's hour. */
async function refreshActivities(actor: ActorContext, day: Date): Promise<number> {
  const rows = await seededRecords("activity", actor);
  let moved = 0;
  for (const row of rows) {
    const current = toIsoInstant(row.dueDate);
    if (!current) continue;
    const dueDate = shiftInstantToDay(current, day);
    if (!dueDate || dueDate === current) continue;
    await entityService.update("activity", String(row.id), { dueDate }, actor);
    moved += 1;
  }
  return moved;
}

/** Re-date the seeded tasks. Their due date is a day, so there is no time to keep. */
async function refreshTasks(actor: ActorContext, day: Date): Promise<number> {
  const rows = await seededRecords("task", actor);
  const dueDate = utcDate(day);
  let moved = 0;
  for (const row of rows) {
    // The column is a day, stored at UTC midnight, so its UTC date is the day.
    if (toIsoInstant(row.dueDate)?.slice(0, 10) === dueDate) continue;
    await entityService.update("task", String(row.id), { dueDate }, actor);
    moved += 1;
  }
  return moved;
}

/**
 * Move this tenant's seeded schedule onto `day` (default: today).
 *
 * Returns how many records moved, so the caller can log something truthful
 * rather than "done".
 */
export async function refreshDemoSchedule(
  tenantId: string,
  options: { day?: Date } = {},
): Promise<DemoRefreshResult> {
  const day = options.day ?? new Date();
  const actor = demoActor(tenantId);
  return {
    activities: await refreshActivities(actor, day),
    tasks: await refreshTasks(actor, day),
  };
}

/**
 * Resolve the configured demo tenant and refresh it.
 *
 * Returns null when no tenant is configured or the configured slug matches
 * nothing — both of which are ordinary, not errors. The absent case is the
 * default, so an install that never wanted this does nothing.
 */
export async function refreshConfiguredDemoTenant(
  slug: string | undefined,
  options: { day?: Date } = {},
): Promise<DemoRefreshResult | null> {
  if (!slug) return null;
  const tenantId = await findTenantIdBySlug(slug);
  if (!tenantId) return null;
  return refreshDemoSchedule(tenantId, options);
}
