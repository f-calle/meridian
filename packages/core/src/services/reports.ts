import type { ActorContext } from "../types.js";
import { entityService } from "./entity-service.js";
import { isPermissionError } from "../acl/permissions.js";
import { owedInvoiceFilter } from "./money.js";

/**
 * Reports that answer a question someone actually asks.
 *
 * The reports page was four charts grouped by status — invoices by status,
 * tasks by status, projects by status, deals by stage — which is the entity
 * list redrawn as bars. None of it had a time axis, so nothing could answer
 * "is this better than last month", and three of the four duplicated the home
 * page. These are chosen for the decision each one drives.
 */

const DAY_MS = 86_400_000;

export interface Bucket {
  label: string;
  value: number;
  count: number;
  /** Filter query string that opens the matching list. */
  href?: string;
}

export interface ReportSet {
  /** Owed money by how late it is. Drives collections. */
  aging: Bucket[];
  /** Weighted open pipeline by expected close month. Drives planning. */
  forecast: Bucket[];
  /** Won value by the month it closed. Needs deal.closedAt. */
  bookings: Bucket[];
  /** Open pipeline split into on-track and past its close date. */
  stalled: { stage: string; onTrack: number; pastDue: number }[];
  /** Biggest customers by invoiced value, and how concentrated that is. */
  concentration: { name: string; value: number; share: number }[];
  /** Quote outcomes by value, plus the acceptance rate. */
  quoteOutcomes: Bucket[];
  acceptanceRate: number | null;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

/** Run a query, yielding an empty result for a role that may not read it. */
async function tolerant<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (isPermissionError(err)) return fallback;
    throw err;
  }
}

/**
 * Receivables aging.
 *
 * Four buckets rather than a total, because "$97,790 owed" and "$97,790 owed,
 * $60,000 of it past sixty days" call for completely different actions.
 */
async function aging(actor: ActorContext, today: Date): Promise<Bucket[]> {
  const at = (days: number) => isoDate(new Date(today.getTime() + days * DAY_MS));
  const ranges: { label: string; filters: Record<string, unknown> }[] = [
    { label: "Not yet due", filters: { dueDate: { op: "gte", value: at(0) } } },
    {
      label: "1–30 days",
      filters: { dueDate: [{ op: "gte", value: at(-30) }, { op: "lt", value: at(0) }] },
    },
    {
      label: "31–60 days",
      filters: { dueDate: [{ op: "gte", value: at(-60) }, { op: "lt", value: at(-30) }] },
    },
    { label: "60+ days", filters: { dueDate: { op: "lt", value: at(-60) } } },
  ];

  return Promise.all(
    ranges.map(async ({ label, filters }) => {
      const [row] = await entityService.aggregate(
        "invoice",
        { metric: "sum", metricField: "total", filters: { ...owedInvoiceFilter(), ...filters } },
        actor,
      );
      return { label, value: row?.value ?? 0, count: row?.count ?? 0 };
    }),
  );
}

/** Open pipeline weighted by win probability, by the month it should close. */
async function forecast(actor: ActorContext, today: Date): Promise<Bucket[]> {
  const rows = await entityService.aggregate(
    "deal",
    {
      groupBy: "expectedClose",
      bucket: "month",
      metric: "weighted_sum",
      metricField: "value",
      weightField: "probability",
      filters: {
        stage: { op: "in", value: ["lead", "qualified", "proposal"] },
        expectedClose: { op: "gte", value: isoDate(today) },
      },
    },
    actor,
  );
  return rows
    .filter((r) => r.group)
    .slice(0, 6)
    .map((r) => ({ label: monthLabel(r.group!), value: r.value ?? 0, count: r.count }));
}

/** Won value by the month it actually closed — the report closedAt exists for. */
async function bookings(actor: ActorContext, today: Date): Promise<Bucket[]> {
  const from = new Date(today.getFullYear(), today.getMonth() - 11, 1);
  const rows = await entityService.aggregate(
    "deal",
    {
      groupBy: "closedAt",
      bucket: "month",
      metric: "sum",
      metricField: "value",
      filters: { stage: "won", closedAt: { op: "gte", value: isoDate(from) } },
    },
    actor,
  );
  return rows
    .filter((r) => r.group)
    .map((r) => ({ label: monthLabel(r.group!), value: r.value ?? 0, count: r.count }));
}

/**
 * How much open pipeline has already gone past its close date.
 *
 * The home page names the individual stalled deals; this sizes the problem in
 * money, per stage, so you can see where deals go to die.
 */
async function stalled(actor: ActorContext, today: Date): Promise<ReportSet["stalled"]> {
  const open = ["lead", "qualified", "proposal"];
  const todayIso = isoDate(today);

  const [all, late] = await Promise.all([
    entityService.aggregate(
      "deal",
      { groupBy: "stage", metric: "sum", metricField: "value", filters: { stage: { op: "in", value: open } } },
      actor,
    ),
    entityService.aggregate(
      "deal",
      {
        groupBy: "stage",
        metric: "sum",
        metricField: "value",
        filters: { stage: { op: "in", value: open }, expectedClose: { op: "lt", value: todayIso } },
      },
      actor,
    ),
  ]);

  const lateByStage = new Map(late.map((r) => [r.group, r.value ?? 0]));
  return open
    .filter((stage) => all.some((r) => r.group === stage))
    .map((stage) => {
      const total = all.find((r) => r.group === stage)?.value ?? 0;
      const pastDue = lateByStage.get(stage) ?? 0;
      return { stage, onTrack: Math.max(0, total - pastDue), pastDue };
    });
}

/** Biggest customers by invoiced value, with each one's share of the total. */
async function concentration(actor: ActorContext): Promise<ReportSet["concentration"]> {
  const rows = await entityService.aggregate(
    "invoice",
    {
      groupBy: "companyId",
      metric: "sum",
      metricField: "total",
      filters: { status: { op: "nin", value: ["draft", "cancelled"] } },
    },
    actor,
  );

  const named = rows.filter((r) => r.group);
  const total = named.reduce((sum, r) => sum + (r.value ?? 0), 0);
  // aggregate orders by count; a concentration report is about value.
  const top = [...named].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 8);

  const companies = await Promise.all(
    top.map((r) =>
      entityService
        .read("company", r.group!, actor)
        .then((c) => String(c.name ?? "Unknown"))
        .catch(() => "Unknown"),
    ),
  );

  return top.map((r, i) => ({
    name: companies[i]!,
    value: r.value ?? 0,
    share: total > 0 ? (r.value ?? 0) / total : 0,
  }));
}

/** What happens to what we propose. */
async function quotes(actor: ActorContext): Promise<{ outcomes: Bucket[]; rate: number | null }> {
  const order = ["draft", "sent", "accepted", "declined", "expired"];
  const rows = await entityService.aggregate(
    "quote",
    { groupBy: "status", metric: "sum", metricField: "total" },
    actor,
  );
  const byStatus = new Map(rows.map((r) => [r.group, r]));
  const outcomes = order
    .filter((status) => byStatus.has(status))
    .map((status) => ({
      label: status,
      value: byStatus.get(status)?.value ?? 0,
      count: byStatus.get(status)?.count ?? 0,
    }));

  // By value, not by count: winning one large quote and losing three small ones
  // is a good quarter, and a count would call it a 25% hit rate.
  const value = (status: string) => byStatus.get(status)?.value ?? 0;
  const settled = value("accepted") + value("declined") + value("expired");
  return { outcomes, rate: settled > 0 ? value("accepted") / settled : null };
}

export async function collectReports(actor: ActorContext): Promise<ReportSet> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [agingRows, forecastRows, bookingRows, stalledRows, concentrationRows, quoteData] =
    await Promise.all([
      tolerant(() => aging(actor, today), []),
      tolerant(() => forecast(actor, today), []),
      tolerant(() => bookings(actor, today), []),
      tolerant(() => stalled(actor, today), []),
      tolerant(() => concentration(actor), []),
      tolerant(() => quotes(actor), { outcomes: [], rate: null }),
    ]);

  return {
    aging: agingRows,
    forecast: forecastRows,
    bookings: bookingRows,
    stalled: stalledRows,
    concentration: concentrationRows,
    quoteOutcomes: quoteData.outcomes,
    acceptanceRate: quoteData.rate,
  };
}
