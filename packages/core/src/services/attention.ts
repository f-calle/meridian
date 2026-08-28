import type { ActorContext } from "../types.js";
import { entityService } from "./entity-service.js";
import { isPermissionError } from "../acl/permissions.js";
import { owedInvoiceFilter } from "./money.js";
import { collectSchedule, serverDayWindow, type DayWindow, type ScheduleSummary } from "./schedule.js";

/**
 * What needs a person today.
 *
 * The dashboard used to show row counts — "26 contacts" — which is inventory,
 * not work. Nobody opens an ERP to learn how many rows it holds; they open it
 * to find out what is late, what is about to lapse, and what money has not
 * arrived. This computes exactly that, so the landing page can be a queue to
 * work through rather than a scoreboard to look at.
 *
 * Every item carries the record it came from, so each row is a link to the
 * thing you need to act on.
 */

export type AttentionKind =
  | "invoice_overdue"
  | "quote_expiring"
  | "deal_stalled"
  | "deal_closing"
  | "activity_overdue"
  | "task_overdue";

export interface AttentionItem {
  kind: AttentionKind;
  entity: string;
  recordId: string;
  title: string;
  /** Short supporting line: who it's for, how late, how much. */
  detail: string;
  /** Days past due (positive) or days remaining (negative). */
  daysOverdue: number;
  /** Money at stake, when the item has any. */
  amount?: number;
  severity: "critical" | "warning" | "info";
}

export interface AttentionSummary {
  items: AttentionItem[];
  /** Total per kind, including items beyond the returned slice. */
  counts: Record<AttentionKind, number>;
  /** Money sitting in overdue invoices. */
  overdueValue: number;
  /** What is on today — the plan, as opposed to the debt above. */
  today: ScheduleSummary;
}

const DAY_MS = 86_400_000;

/**
 * Shift a YYYY-MM-DD date by whole days, staying on the calendar.
 *
 * Deliberately not `new Date(start + n * DAY_MS).toISOString()`: the window's
 * start is an instant at the user's local midnight, so slicing its UTC form
 * names the wrong day for timezones far enough from UTC, and the horizons
 * below would land a day out for them.
 */
function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** Whole days between a due date and today; positive means overdue. */
function daysBetween(due: unknown, from: Date): number {
  const date = due ? new Date(String(due)) : null;
  if (!date || Number.isNaN(date.getTime())) return 0;
  return Math.round((from.getTime() - date.getTime()) / DAY_MS);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

const money = (n: unknown) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n ?? 0));

/**
 * Read a slice of an entity, tolerating the roles that cannot see it.
 *
 * A sales user has no read permission on some entities, and one denial must not
 * blank the whole dashboard — that section is simply absent for them.
 */
async function safeList(
  entity: string,
  actor: ActorContext,
  query: Parameters<typeof entityService.list>[1],
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  try {
    const result = await entityService.list(entity, query, actor);
    return { rows: result.data, total: result.total };
  } catch (err) {
    if (isPermissionError(err)) return { rows: [], total: 0 };
    throw err;
  }
}

/** Build the attention queue for an actor's tenant. */
export async function collectAttention(
  actor: ActorContext,
  options: { limit?: number; day?: DayWindow } = {},
): Promise<AttentionSummary> {
  const limit = options.limit ?? 12;
  const day = options.day ?? serverDayWindow();
  const today = day.start;
  const todayIso = day.date;
  const inSevenDays = addDays(todayIso, 7);
  const inFourteenDays = addDays(todayIso, 14);
  // "Stalled" is a deal whose expected close has come and gone while it sits in
  // an open stage — the single most common way pipeline value quietly rots.
  const base = { tenantId: actor.tenantId, pageSize: 25 } as const;

  const [invoices, quotes, stalledDeals, closingDeals, activities, tasks, schedule] = await Promise.all([
    safeList("invoice", actor, {
      ...base,
      filters: { ...owedInvoiceFilter(), dueDate: { op: "lt", value: todayIso } },
      sortBy: "dueDate",
      sortOrder: "asc",
    }),
    safeList("quote", actor, {
      ...base,
      filters: {
        status: { op: "in", value: ["draft", "sent"] },
        expiryDate: [
          { op: "gte", value: todayIso },
          { op: "lte", value: inSevenDays },
        ],
      },
      sortBy: "expiryDate",
      sortOrder: "asc",
    }),
    safeList("deal", actor, {
      ...base,
      filters: {
        stage: { op: "in", value: ["lead", "qualified", "proposal"] },
        expectedClose: { op: "lt", value: todayIso },
      },
      sortBy: "expectedClose",
      sortOrder: "asc",
    }),
    safeList("deal", actor, {
      ...base,
      filters: {
        stage: { op: "in", value: ["lead", "qualified", "proposal"] },
        expectedClose: [
          { op: "gte", value: todayIso },
          { op: "lte", value: inFourteenDays },
        ],
      },
      sortBy: "expectedClose",
      sortOrder: "asc",
    }),
    safeList("activity", actor, {
      ...base,
      // Before today, not before this instant. Anything due today — including
      // the 9am nobody got to — belongs to the schedule panel, and listing it
      // in both places would double-count the same commitment on one screen.
      filters: { completed: false, dueDate: { op: "lt", value: day.start.toISOString() } },
      sortBy: "dueDate",
      sortOrder: "asc",
    }),
    safeList("task", actor, {
      ...base,
      filters: { status: { op: "ne", value: "done" }, dueDate: { op: "lt", value: todayIso } },
      sortBy: "dueDate",
      sortOrder: "asc",
    }),
    collectSchedule(actor, { day }),
  ]);

  const items: AttentionItem[] = [];

  for (const invoice of invoices.rows) {
    const late = daysBetween(invoice.dueDate, today);
    items.push({
      kind: "invoice_overdue",
      entity: "invoice",
      recordId: String(invoice.id),
      title: `Invoice ${invoice.number ?? ""}`.trim(),
      detail: `${money(invoice.total)} · ${plural(late, "day")} overdue`,
      daysOverdue: late,
      amount: Number(invoice.total ?? 0),
      // A month late is a collections problem, not a reminder.
      severity: late >= 30 ? "critical" : "warning",
    });
  }

  for (const quote of quotes.rows) {
    const remaining = -daysBetween(quote.expiryDate, today);
    items.push({
      kind: "quote_expiring",
      entity: "quote",
      recordId: String(quote.id),
      title: `Quote ${quote.number ?? ""}`.trim(),
      detail:
        remaining <= 0
          ? `${money(quote.total)} · expires today`
          : `${money(quote.total)} · expires in ${plural(remaining, "day")}`,
      daysOverdue: -remaining,
      amount: Number(quote.total ?? 0),
      // Anything reaching this list already lapses within the week, and a quote
      // that lapses is lost rather than late — so the whole window is a
      // warning. Ranking it as "info" buried real money under one-day-late
      // phone calls.
      severity: "warning",
    });
  }

  for (const deal of stalledDeals.rows) {
    const late = daysBetween(deal.expectedClose, today);
    items.push({
      kind: "deal_stalled",
      entity: "deal",
      recordId: String(deal.id),
      title: String(deal.title ?? "Untitled deal"),
      detail: `${money(deal.value)} · close date passed ${plural(late, "day")} ago`,
      daysOverdue: late,
      amount: Number(deal.value ?? 0),
      severity: late >= 14 ? "critical" : "warning",
    });
  }

  for (const deal of closingDeals.rows) {
    const remaining = -daysBetween(deal.expectedClose, today);
    items.push({
      kind: "deal_closing",
      entity: "deal",
      recordId: String(deal.id),
      title: String(deal.title ?? "Untitled deal"),
      detail: `${money(deal.value)} · expected to close in ${plural(remaining, "day")}`,
      daysOverdue: -remaining,
      amount: Number(deal.value ?? 0),
      severity: "info",
    });
  }

  for (const activity of activities.rows) {
    const late = daysBetween(activity.dueDate, today);
    items.push({
      kind: "activity_overdue",
      entity: "activity",
      recordId: String(activity.id),
      title: String(activity.subject ?? activity.type ?? "Activity"),
      detail: `${String(activity.type ?? "activity")} · ${plural(late, "day")} overdue`,
      daysOverdue: late,
      severity: late >= 7 ? "warning" : "info",
    });
  }

  for (const task of tasks.rows) {
    const late = daysBetween(task.dueDate, today);
    items.push({
      kind: "task_overdue",
      entity: "task",
      recordId: String(task.id),
      title: String(task.title ?? "Task"),
      detail: `${String(task.priority ?? "task")} priority · ${plural(late, "day")} overdue`,
      daysOverdue: late,
      severity: task.priority === "urgent" || late >= 7 ? "warning" : "info",
    });
  }

  const counts: Record<AttentionKind, number> = {
    invoice_overdue: invoices.total,
    quote_expiring: quotes.total,
    deal_stalled: stalledDeals.total,
    deal_closing: closingDeals.total,
    activity_overdue: activities.total,
    task_overdue: tasks.total,
  };

  return {
    items: rankAttention(items).slice(0, limit),
    counts,
    overdueValue: invoices.rows.reduce((sum, i) => sum + Number(i.total ?? 0), 0),
    today: schedule,
  };
}

/**
 * Order the queue the way a person would work it.
 *
 * Severity first, because a 60-day-old unpaid invoice outranks a task due
 * yesterday however urgent the task claims to be. Then lateness, then money —
 * of two equally late invoices, chase the larger one.
 */
export function rankAttention(items: AttentionItem[]): AttentionItem[] {
  const weight = { critical: 0, warning: 1, info: 2 };
  return [...items].sort(
    (a, b) =>
      weight[a.severity] - weight[b.severity] ||
      b.daysOverdue - a.daysOverdue ||
      (b.amount ?? 0) - (a.amount ?? 0),
  );
}
