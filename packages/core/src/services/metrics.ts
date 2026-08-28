import type { ActorContext } from "../types.js";
import { entityService } from "./entity-service.js";
import { isPermissionError } from "../acl/permissions.js";
import { owedInvoiceFilter } from "./money.js";

/**
 * The handful of numbers a dashboard should lead with.
 *
 * Not row counts. "26 contacts" is inventory: it never changes what anyone does
 * next. These are the figures someone running the business actually steers by —
 * what is in play, what it is realistically worth, how much is owed, and how
 * often deals are won.
 */

export interface DashboardMetrics {
  /** Deals in an open stage. */
  openCount: number;
  openValue: number;
  /** Open value weighted by each deal's win probability. */
  weightedForecast: number;
  /** Value already won. */
  wonValue: number;
  wonCount: number;
  lostCount: number;
  /** Won / (won + lost), or null before anything has closed. */
  winRate: number | null;
  /** Money in invoices that have been sent and not fully paid. */
  outstandingValue: number;
  /** Stages in pipeline order, so the chart reads as a funnel. */
  pipeline: { stage: string; count: number; value: number }[];
}

const OPEN_STAGES = ["lead", "qualified", "proposal"];
/** Pipeline order, not alphabetical — a funnel read out of order says nothing. */
const STAGE_ORDER = ["lead", "qualified", "proposal", "won", "lost"];

export async function collectMetrics(actor: ActorContext): Promise<DashboardMetrics> {
  const empty: DashboardMetrics = {
    openCount: 0,
    openValue: 0,
    weightedForecast: 0,
    wonValue: 0,
    wonCount: 0,
    lostCount: 0,
    winRate: null,
    outstandingValue: 0,
    pipeline: [],
  };

  let byStage: { group: string | null; count: number; value: number | null }[] = [];
  let forecast = 0;
  try {
    const [stages, weighted] = await Promise.all([
      entityService.aggregate(
        "deal",
        { groupBy: "stage", metric: "sum", metricField: "value" },
        actor,
      ),
      entityService.aggregate(
        "deal",
        {
          metric: "weighted_sum",
          metricField: "value",
          weightField: "probability",
          filters: { stage: { op: "in", value: OPEN_STAGES } },
        },
        actor,
      ),
    ]);
    byStage = stages;
    forecast = weighted[0]?.value ?? 0;
  } catch (err) {
    // A role that cannot read deals gets a dashboard without deal figures,
    // rather than no dashboard.
    if (!isPermissionError(err)) throw err;
    return empty;
  }

  const stageMap = new Map(byStage.map((s) => [s.group ?? "unassigned", s]));
  const pipeline = STAGE_ORDER.filter((stage) => stageMap.has(stage)).map((stage) => ({
    stage,
    count: stageMap.get(stage)!.count,
    value: stageMap.get(stage)!.value ?? 0,
  }));

  const open = byStage.filter((s) => s.group !== null && OPEN_STAGES.includes(s.group));
  const won = stageMap.get("won");
  const lost = stageMap.get("lost");
  const closed = (won?.count ?? 0) + (lost?.count ?? 0);

  let outstandingValue = 0;
  try {
    const [outstanding] = await entityService.aggregate(
      "invoice",
      {
        metric: "sum",
        metricField: "total",
        filters: owedInvoiceFilter(),
      },
      actor,
    );
    outstandingValue = outstanding?.value ?? 0;
  } catch (err) {
    if (!isPermissionError(err)) throw err;
  }

  return {
    openCount: open.reduce((sum, s) => sum + s.count, 0),
    openValue: open.reduce((sum, s) => sum + (s.value ?? 0), 0),
    weightedForecast: forecast,
    wonValue: won?.value ?? 0,
    wonCount: won?.count ?? 0,
    lostCount: lost?.count ?? 0,
    // Before anything has closed there is no rate — 0% would read as "we lose
    // everything," which is a different and wrong claim.
    winRate: closed > 0 ? (won?.count ?? 0) / closed : null,
    outstandingValue,
    pipeline,
  };
}
