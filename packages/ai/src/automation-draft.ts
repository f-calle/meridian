import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { entityRegistry } from "@meridian/core";
import type { AutomationCondition, AutomationAction } from "@meridian/core";

export interface AutomationDraft {
  name: string;
  entity: string;
  event: "created" | "updated" | "deleted";
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  /** Deterministic human-readable restatement of the rule for the preview */
  summary: string;
}

const CONDITION_OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "contains", "is_set", "not_set"] as const;

function entityCatalog(): string {
  return entityRegistry
    .list()
    .map((e) => {
      const fields = Object.entries(e.fields)
        .map(([name, def]) => {
          const parts: string[] = [def.type];
          if (def.options?.length) parts.push(`one of: ${def.options.join("|")}`);
          if (def.relation) parts.push(`id of a ${def.relation}`);
          return `${name} (${parts.join(", ")})`;
        })
        .join("; ");
      return `- ${e.name}: ${fields}`;
    })
    .join("\n");
}

function buildSchema() {
  const entityNames = entityRegistry.list().map((e) => e.name) as [string, ...string[]];
  return z.object({
    name: z.string().describe("Short human-readable rule name"),
    entity: z.enum(entityNames).describe("Entity whose events trigger the rule"),
    event: z.enum(["created", "updated", "deleted"]),
    conditions: z.array(
      z.object({
        field: z.string(),
        op: z.enum(CONDITION_OPS),
        value: z.union([z.string(), z.number(), z.boolean()]).optional(),
      }),
    ),
    actions: z.array(
      z.union([
        z.object({
          type: z.literal("set_field"),
          field: z.string(),
          value: z.union([z.string(), z.number(), z.boolean()]),
        }),
        z.object({
          type: z.literal("create_record"),
          entity: z.enum(entityNames),
          data: z.record(z.union([z.string(), z.number(), z.boolean()])),
        }),
        z.object({
          type: z.literal("webhook"),
          url: z.string().url(),
        }),
      ]),
    ),
  });
}

/** Validate the model output against the live entity registry; returns error strings. */
export function validateDraft(draft: Omit<AutomationDraft, "summary">): string[] {
  const errors: string[] = [];
  const entity = entityRegistry.get(draft.entity);
  if (!entity) return [`Unknown entity: ${draft.entity}`];

  for (const cond of draft.conditions) {
    if (!entity.fields[cond.field]) {
      errors.push(`Condition references unknown field "${cond.field}" on ${draft.entity}`);
    }
    if (!["is_set", "not_set"].includes(cond.op) && cond.value === undefined) {
      errors.push(`Condition on "${cond.field}" (${cond.op}) needs a value`);
    }
  }

  if (draft.actions.length === 0) errors.push("Rule has no actions");
  for (const action of draft.actions) {
    if (action.type === "set_field" && !entity.fields[action.field]) {
      errors.push(`set_field targets unknown field "${action.field}" on ${draft.entity}`);
    }
    if (action.type === "create_record") {
      const target = entityRegistry.get(action.entity);
      if (!target) {
        errors.push(`create_record targets unknown entity "${action.entity}"`);
      } else {
        for (const key of Object.keys(action.data)) {
          if (!target.fields[key]) {
            errors.push(`create_record data has unknown field "${key}" on ${action.entity}`);
          }
        }
      }
    }
  }
  return errors;
}

export function summarizeDraft(draft: Omit<AutomationDraft, "summary">): string {
  const when =
    draft.conditions.length === 0
      ? ""
      : " when " +
        draft.conditions
          .map((c) =>
            c.op === "is_set"
              ? `${c.field} is set`
              : c.op === "not_set"
                ? `${c.field} is empty`
                : `${c.field} ${c.op} ${JSON.stringify(c.value)}`,
          )
          .join(" and ");
  const does = draft.actions
    .map((a) =>
      a.type === "set_field"
        ? `set ${a.field} to ${JSON.stringify(a.value)}`
        : a.type === "create_record"
          ? `create a ${a.entity}`
          : `call webhook ${a.url}`,
    )
    .join(", then ");
  return `When a ${draft.entity} is ${draft.event}${when}: ${does}.`;
}

/**
 * Turn an English description into a validated automation rule.
 * Throws with a readable message when the request can't be expressed.
 */
export async function draftAutomation(prompt: string, model?: string): Promise<AutomationDraft> {
  const result = await generateObject({
    model: anthropic(model ?? process.env.MERIDIAN_LLM_MODEL ?? "claude-sonnet-4-20250514"),
    schema: buildSchema(),
    system: `You convert plain-English business rules into Meridian automation rules.

Entities and their fields:
${entityCatalog()}

Rules:
- conditions evaluate against the record's fields; on "updated" events the rule only fires when a condition field actually changed (transition semantics).
- create_record data values may use {{field}} templates that interpolate the triggering record's fields, plus {{recordId}} and {{entity}}.
- Use only fields that exist on the chosen entity. Prefer select-field values from the allowed options.
- Keep the rule minimal — express exactly what was asked, nothing more.`,
    prompt,
  });

  const draft = result.object as Omit<AutomationDraft, "summary">;
  const errors = validateDraft(draft);
  if (errors.length > 0) {
    throw new Error(`The drafted rule has problems: ${errors.join("; ")}`);
  }
  return { ...draft, summary: summarizeDraft(draft) };
}
