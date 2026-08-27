import type { ActorContext } from "@meridian/core";
import { entityService } from "@meridian/core";
import { getAnthropicClient, resolveModel, messageText } from "./client.js";

export interface BriefingData {
  pipeline: { group: string | null; count: number; value: number | null }[];
  openDealCount: number;
  openDealValue: number;
  overdueActivities: Record<string, unknown>[];
  openTasksByStatus: { status: string | null; count: number }[];
  activeProjects: number;
}

export interface Briefing {
  generatedAt: string;
  data: BriefingData;
  summary: string;
  /** True when served from cache rather than regenerated */
  cached?: boolean;
}

/**
 * Briefings change on the scale of hours, not seconds, but the dashboard asks
 * for one on every load. Cache per tenant so only the first visit pays for the
 * model call. TTL is deliberately short so a day's work still shows up.
 */
const CACHE_TTL_MS = Number(process.env.MERIDIAN_BRIEFING_TTL_MS ?? 10 * 60 * 1000);
const cache = new Map<string, { expires: number; briefing: Briefing }>();

export function clearBriefingCache(tenantId?: string): void {
  if (tenantId) cache.delete(tenantId);
  else cache.clear();
}

async function collectBriefingData(actor: ActorContext): Promise<BriefingData> {
  const [pipeline, activities, tasksByStatus, projects] = await Promise.all([
    entityService.aggregate(
      "deal",
      { groupBy: "stage", metric: "sum", metricField: "value" },
      actor,
    ),
    entityService.list(
      "activity",
      {
        tenantId: actor.tenantId,
        filters: { completed: false },
        sortBy: "dueDate",
        sortOrder: "asc",
        pageSize: 25,
      },
      actor,
    ),
    entityService.aggregate("task", { groupBy: "status" }, actor),
    entityService.aggregate("project", { filters: { status: "active" } }, actor),
  ]);

  const now = new Date();
  const overdueActivities = activities.data.filter((a) => {
    const due = a.dueDate ? new Date(String(a.dueDate)) : null;
    return due !== null && due < now;
  });

  const openStages = new Set(["lead", "qualified", "proposal"]);
  const openDeals = pipeline.filter((p) => p.group !== null && openStages.has(p.group));

  return {
    pipeline,
    openDealCount: openDeals.reduce((acc, p) => acc + p.count, 0),
    openDealValue: openDeals.reduce((acc, p) => acc + (p.value ?? 0), 0),
    overdueActivities: overdueActivities.slice(0, 10),
    openTasksByStatus: tasksByStatus
      .filter((t) => t.group !== "done")
      .map((t) => ({ status: t.group, count: t.count })),
    activeProjects: projects[0]?.count ?? 0,
  };
}

function fallbackSummary(data: BriefingData): string {
  const lines: string[] = [];
  lines.push(
    `Open pipeline: ${data.openDealCount} deal${data.openDealCount === 1 ? "" : "s"} worth $${data.openDealValue.toLocaleString()}.`,
  );
  const openTasks = data.openTasksByStatus.reduce((acc, t) => acc + t.count, 0);
  lines.push(`${openTasks} open task${openTasks === 1 ? "" : "s"} across ${data.activeProjects} active project${data.activeProjects === 1 ? "" : "s"}.`);
  if (data.overdueActivities.length > 0) {
    lines.push(`${data.overdueActivities.length} overdue activit${data.overdueActivities.length === 1 ? "y" : "ies"} need attention.`);
  } else {
    lines.push("No overdue activities — nice work.");
  }
  return lines.join(" ");
}

/**
 * Build a daily briefing for the actor's tenant: pipeline health, overdue
 * work, and open tasks. Uses the LLM for a narrative summary when an API
 * key is configured, and a deterministic summary otherwise.
 */
export async function generateBriefing(
  actor: ActorContext,
  model?: string,
  options: { refresh?: boolean } = {},
): Promise<Briefing> {
  if (!options.refresh) {
    const hit = cache.get(actor.tenantId);
    if (hit && hit.expires > Date.now()) return { ...hit.briefing, cached: true };
  }

  const data = await collectBriefingData(actor);

  let summary = fallbackSummary(data);

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const response = await getAnthropicClient().messages.create({
        model: resolveModel(model, "briefing"),
        max_tokens: 400,
        system:
          "You write short, actionable morning briefings for a business owner. " +
          "3-5 sentences. Lead with what needs attention today. Use plain language, no headers.",
        messages: [
          { role: "user", content: `Write today's briefing from this data:\n${JSON.stringify(data, null, 2)}` },
        ],
      });
      const text = messageText(response.content).trim();
      if (response.stop_reason !== "refusal" && text) summary = text;
    } catch (err) {
      console.error("[briefing] LLM summary failed, using fallback:", (err as Error).message);
    }
  }

  const briefing: Briefing = { generatedAt: new Date().toISOString(), data, summary };
  cache.set(actor.tenantId, { expires: Date.now() + CACHE_TTL_MS, briefing });
  return briefing;
}
