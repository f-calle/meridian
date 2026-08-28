import type { ActorContext } from "../types.js";
import { entityService } from "./entity-service.js";
import { isPermissionError } from "../acl/permissions.js";

/**
 * What is on today.
 *
 * The attention queue answers "what is late". That is not the same question as
 * "what am I committed to today", and answering only the first one leaves a
 * gap you notice the moment you use the app in the morning: a call booked for
 * 3pm is invisible at 9am, then appears in the overdue list at 3:01pm. By then
 * it is not a plan, it is a failure.
 *
 * So this is the day ahead, not the debt behind. Timed commitments in clock
 * order, then the things due today that have no time attached.
 */

export type ScheduleKind = "activity" | "task";

export interface ScheduleItem {
  kind: ScheduleKind;
  entity: string;
  recordId: string;
  title: string;
  /** Short supporting line: the activity type, or the task's priority. */
  detail: string;
  /** Task priority, when the item is a task. Drives the badge and the ordering. */
  priority?: "low" | "medium" | "high" | "urgent";
  /** When it is due, as an instant. Null for things due today with no time. */
  at: string | null;
  /** True once the clock has passed it — the UI dims these rather than hiding them. */
  past: boolean;
}

export interface ScheduleSummary {
  items: ScheduleItem[];
  /** Everything due today, including items beyond the returned slice. */
  total: number;
}

/**
 * The window a day covers.
 *
 * The server runs in UTC and the person does not. A schedule shown against the
 * server's midnight is wrong by hours for most of the world, and wrong in the
 * direction that matters — late afternoon in the Americas is already tomorrow
 * in UTC, which would empty the panel exactly when someone is checking what is
 * left of their day. So the browser sends its own day boundaries and this
 * module treats them as the truth.
 */
export interface DayWindow {
  start: Date;
  end: Date;
  /**
   * The calendar date the window covers, as YYYY-MM-DD.
   *
   * This cannot be derived from `start`: local midnight in Auckland is the
   * previous afternoon in UTC, so slicing the instant would name the wrong day
   * for every timezone far enough east. Date-only columns are matched against
   * this, and the client is the only party that knows it.
   */
  date: string;
}

/** The current day in the server's own timezone — the fallback when the client sends none. */
export function serverDayWindow(now = new Date()): DayWindow {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  return { start, end, date: localDate(start) };
}

/** A Date's own calendar date, read in the runtime's timezone rather than UTC. */
function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const MAX_SPAN_MS = 48 * 60 * 60 * 1000;

/**
 * Read a day window off query parameters, falling back to the server's day.
 *
 * A caller can be wrong or hostile, so the span is bounded: without a ceiling
 * "today" could be asked to mean a decade, and the panel would quietly become
 * an unpaginated dump of every activity in the tenant.
 */
export function parseDayWindow(
  start: string | undefined,
  end: string | undefined,
  date: string | undefined,
  now = new Date(),
): DayWindow {
  if (!start || !end || !date) return serverDayWindow(now);
  if (!DATE_ONLY.test(date)) return serverDayWindow(now);
  const from = new Date(start);
  const to = new Date(end);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return serverDayWindow(now);
  if (to <= from || to.getTime() - from.getTime() > MAX_SPAN_MS) return serverDayWindow(now);
  return { start: from, end: to, date };
}

async function safeList(
  entity: string,
  actor: ActorContext,
  query: Parameters<typeof entityService.list>[1],
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  try {
    const result = await entityService.list(entity, query, actor);
    return { rows: result.data, total: result.total };
  } catch (err) {
    // One denied entity must not blank the panel; that section is simply
    // absent for a role that cannot see it.
    if (isPermissionError(err)) return { rows: [], total: 0 };
    throw err;
  }
}

/** Everything due in the given day window, in the order a person works it. */
export async function collectSchedule(
  actor: ActorContext,
  options: { limit?: number; day?: DayWindow; now?: Date } = {},
): Promise<ScheduleSummary> {
  const limit = options.limit ?? 8;
  const day = options.day ?? serverDayWindow(options.now);
  const now = options.now ?? new Date();
  const base = { tenantId: actor.tenantId, pageSize: 25 } as const;

  const [activities, tasks] = await Promise.all([
    safeList("activity", actor, {
      ...base,
      filters: {
        completed: false,
        dueDate: [
          { op: "gte", value: day.start.toISOString() },
          { op: "lt", value: day.end.toISOString() },
        ],
      },
      sortBy: "dueDate",
      sortOrder: "asc",
    }),
    safeList("task", actor, {
      ...base,
      filters: {
        status: { op: "ne", value: "done" },
        // task.dueDate is date-only, so it is matched on the calendar date the
        // window opens on rather than on the instants either side of it.
        dueDate: { op: "eq", value: day.date },
      },
      // "priority" sorts alphabetically in SQL — high, low, medium, urgent —
      // which is not priority order, so ordering happens in rankSchedule.
      sortBy: "title",
      sortOrder: "asc",
    }),
  ]);

  const items: ScheduleItem[] = [];

  for (const activity of activities.rows) {
    const at = activity.dueDate ? new Date(String(activity.dueDate)) : null;
    const valid = at && !Number.isNaN(at.getTime()) ? at : null;
    items.push({
      kind: "activity",
      entity: "activity",
      recordId: String(activity.id),
      title: String(activity.subject ?? activity.type ?? "Activity"),
      detail: String(activity.type ?? "activity"),
      at: valid ? valid.toISOString() : null,
      past: valid ? valid.getTime() < now.getTime() : false,
    });
  }

  for (const task of tasks.rows) {
    const priority = String(task.priority ?? "medium");
    items.push({
      kind: "task",
      entity: "task",
      recordId: String(task.id),
      title: String(task.title ?? "Task"),
      detail: `${priority} priority`,
      priority: isPriority(priority) ? priority : "medium",
      // Date-only: due today, but not at any particular moment. Claiming
      // midnight would sort it above a real 9am meeting for no reason.
      at: null,
      past: false,
    });
  }

  return {
    items: rankSchedule(items).slice(0, limit),
    total: activities.total + tasks.total,
  };
}

/**
 * Clock order, with the untimed at the end.
 *
 * A day reads top to bottom. Things with a time go in the order they happen;
 * things merely due today have no place in that sequence and sit below it.
 */
export function rankSchedule(items: ScheduleItem[]): ScheduleItem[] {
  return [...items].sort((a, b) => {
    if (a.at && b.at) return a.at.localeCompare(b.at);
    if (a.at) return -1;
    if (b.at) return 1;
    return PRIORITY_RANK[a.priority ?? "medium"] - PRIORITY_RANK[b.priority ?? "medium"]
      || a.title.localeCompare(b.title);
  });
}

const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 } as const;

function isPriority(value: string): value is keyof typeof PRIORITY_RANK {
  return Object.hasOwn(PRIORITY_RANK, value);
}
