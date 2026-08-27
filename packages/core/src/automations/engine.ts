import type { ActorContext, HookContext, LifecycleEvent } from "../types.js";
import { eventBus } from "../events/event-bus.js";
import { entityService } from "../services/entity-service.js";
import { entityRegistry } from "../entity/registry.js";
import { getSql } from "../db/raw-sql.js";

export interface AutomationCondition {
  field: string;
  op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "is_set" | "not_set";
  value?: unknown;
}

export type AutomationAction =
  | { type: "set_field"; field: string; value: unknown }
  | { type: "create_record"; entity: string; data: Record<string, unknown> }
  | { type: "webhook"; url: string };

export interface AutomationRule {
  id: string;
  name: string;
  entity: string;
  event: "created" | "updated" | "deleted";
  conditions: AutomationCondition[];
  actions: AutomationAction[];
}

const LIFECYCLE_TO_EVENT: Record<LifecycleEvent, AutomationRule["event"]> = {
  onCreate: "created",
  onUpdate: "updated",
  onDelete: "deleted",
};

const CACHE_TTL_MS = 10_000;
const ruleCache = new Map<string, { expires: number; rules: AutomationRule[] }>();

export function clearAutomationCache(): void {
  ruleCache.clear();
}

export function evaluateConditions(
  conditions: AutomationCondition[],
  data: Record<string, unknown>,
): boolean {
  return conditions.every((cond) => {
    const actual = data[cond.field];
    switch (cond.op) {
      case "eq":
        return actual === cond.value || String(actual) === String(cond.value);
      case "neq":
        return actual !== cond.value && String(actual) !== String(cond.value);
      case "gt":
        return Number(actual) > Number(cond.value);
      case "gte":
        return Number(actual) >= Number(cond.value);
      case "lt":
        return Number(actual) < Number(cond.value);
      case "lte":
        return Number(actual) <= Number(cond.value);
      case "contains":
        return String(actual ?? "").toLowerCase().includes(String(cond.value ?? "").toLowerCase());
      case "is_set":
        return actual !== undefined && actual !== null && actual !== "";
      case "not_set":
        return actual === undefined || actual === null || actual === "";
      default:
        return false;
    }
  });
}

/**
 * Whether a rule should fire for this event. Conditions evaluate against the
 * full record state; on "updated" events a rule with conditions only fires
 * when at least one condition field actually changed, giving transition
 * semantics ("when stage becomes won") instead of re-firing on every edit.
 */
export function ruleMatches(
  rule: AutomationRule,
  event: AutomationRule["event"],
  ctx: Pick<HookContext, "entityName" | "data" | "changes">,
): boolean {
  if (rule.entity !== ctx.entityName || rule.event !== event) return false;
  if (!evaluateConditions(rule.conditions, ctx.data)) return false;
  if (event === "updated" && rule.conditions.length > 0 && ctx.changes) {
    return rule.conditions.some((c) => c.field in ctx.changes!);
  }
  return true;
}

/** Replace {{field}} placeholders with values from the trigger context. */
export function interpolate(template: unknown, ctx: HookContext): unknown {
  if (typeof template === "string") {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      if (key === "recordId") return ctx.recordId;
      if (key === "entity") return ctx.entityName;
      const value = ctx.data[key];
      return value === undefined || value === null ? "" : String(value);
    });
  }
  if (Array.isArray(template)) return template.map((item) => interpolate(item, ctx));
  if (template && typeof template === "object") {
    return Object.fromEntries(
      Object.entries(template as Record<string, unknown>).map(([k, v]) => [k, interpolate(v, ctx)]),
    );
  }
  return template;
}

async function loadRules(tenantId: string): Promise<AutomationRule[]> {
  const cached = ruleCache.get(tenantId);
  if (cached && cached.expires > Date.now()) return cached.rules;

  let rules: AutomationRule[] = [];
  try {
    const rows = await getSql().unsafe(
      `SELECT id, name, entity, event, conditions, actions FROM automation WHERE tenant_id = $1 AND enabled = true`,
      [tenantId],
    );
    rules = (rows as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      entity: String(r.entity),
      event: r.event as AutomationRule["event"],
      conditions: normalizeArray(r.conditions) as AutomationCondition[],
      actions: normalizeArray(r.actions) as AutomationAction[],
    }));
  } catch (err) {
    // Table may not exist yet (pre-migration); treat as no rules.
    console.error("[automations] failed to load rules:", (err as Error).message);
  }

  ruleCache.set(tenantId, { expires: Date.now() + CACHE_TTL_MS, rules });
  return rules;
}

function normalizeArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function executeAction(
  action: AutomationAction,
  rule: AutomationRule,
  ctx: HookContext,
): Promise<void> {
  // Automation actions run as a system actor; the engine skips events from
  // system actors, which bounds cascades to a single hop.
  const actor: ActorContext = {
    id: `automation:${rule.id}`,
    type: "system",
    tenantId: ctx.tenantId,
    role: "admin",
  };

  switch (action.type) {
    case "set_field": {
      if (ctx.recordId) {
        await entityService.update(
          ctx.entityName,
          ctx.recordId,
          { [action.field]: interpolate(action.value, ctx) },
          actor,
        );
      }
      break;
    }
    case "create_record": {
      if (!entityRegistry.get(action.entity)) {
        throw new Error(`Unknown entity in automation action: ${action.entity}`);
      }
      await entityService.create(
        action.entity,
        interpolate(action.data, ctx) as Record<string, unknown>,
        actor,
      );
      break;
    }
    case "webhook": {
      const url = new URL(action.url);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error(`Unsupported webhook protocol: ${url.protocol}`);
      }
      await fetch(action.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          automation: rule.name,
          entity: ctx.entityName,
          recordId: ctx.recordId,
          event: rule.event,
          data: ctx.data,
        }),
      });
      break;
    }
    default:
      throw new Error(`Unknown automation action type: ${(action as { type: string }).type}`);
  }
}

async function handleLifecycle(event: LifecycleEvent, ctx: HookContext): Promise<void> {
  // Never react to system-actor mutations (automation output) or to
  // changes on automation rules themselves.
  if (ctx.actor.type === "system") return;
  if (ctx.entityName === "automation") {
    ruleCache.delete(ctx.tenantId);
    return;
  }

  const rules = await loadRules(ctx.tenantId);
  const matching = rules.filter((r) => ruleMatches(r, LIFECYCLE_TO_EVENT[event], ctx));

  for (const rule of matching) {
    for (const action of rule.actions) {
      try {
        await executeAction(action, rule, ctx);
      } catch (err) {
        console.error(`[automations] rule "${rule.name}" action failed:`, (err as Error).message);
      }
    }
  }
}

let started = false;

/** Subscribe the automation engine to entity lifecycle events. Idempotent. */
export function startAutomationEngine(): void {
  if (started) return;
  started = true;

  for (const event of ["onCreate", "onUpdate", "onDelete"] as LifecycleEvent[]) {
    eventBus.on(`*.${event}`, (ctx: HookContext) => {
      handleLifecycle(event, ctx).catch((err) =>
        console.error("[automations] handler error:", (err as Error).message),
      );
    });
  }
}
