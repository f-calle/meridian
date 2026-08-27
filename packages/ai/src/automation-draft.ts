import { entityRegistry } from "@meridian/core";
import type { AutomationCondition, AutomationAction } from "@meridian/core";
import { getAnthropicClient, resolveModel } from "./client.js";

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

/** Strict JSON Schema for the rule tool — guarantees a validating tool_use input. */
function buildRuleSchema() {
  const entityNames = entityRegistry.list().map((e) => e.name);
  const scalar = { type: ["string", "number", "boolean"] };
  return {
    type: "object",
    properties: {
      name: { type: "string", description: "Short human-readable rule name" },
      entity: { type: "string", enum: entityNames, description: "Entity whose events trigger the rule" },
      event: { type: "string", enum: ["created", "updated", "deleted"] },
      conditions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            field: { type: "string" },
            op: { type: "string", enum: [...CONDITION_OPS] },
            value: scalar,
          },
          required: ["field", "op"],
          additionalProperties: false,
        },
      },
      actions: {
        type: "array",
        items: {
          anyOf: [
            {
              type: "object",
              properties: {
                type: { type: "string", enum: ["set_field"] },
                field: { type: "string" },
                value: scalar,
              },
              required: ["type", "field", "value"],
              additionalProperties: false,
            },
            {
              type: "object",
              properties: {
                type: { type: "string", enum: ["create_record"] },
                entity: { type: "string", enum: entityNames },
                data: {
                  type: "array",
                  description: "Field values for the new record, as field/value pairs",
                  items: {
                    type: "object",
                    properties: {
                      field: { type: "string" },
                      value: scalar,
                    },
                    required: ["field", "value"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["type", "entity", "data"],
              additionalProperties: false,
            },
            {
              type: "object",
              properties: {
                type: { type: "string", enum: ["webhook"] },
                url: { type: "string" },
              },
              required: ["type", "url"],
              additionalProperties: false,
            },
          ],
        },
      },
    },
    required: ["name", "entity", "event", "conditions", "actions"],
    additionalProperties: false,
  } as const;
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
  const response = await getAnthropicClient().messages.create({
    model: resolveModel(model, "automation-draft"),
    max_tokens: 16000,
    system: `You convert plain-English business rules into Meridian automation rules.
Call the save_automation_rule tool exactly once with the drafted rule.

Entities and their fields:
${entityCatalog()}

Rules:
- conditions evaluate against the record's fields; on "updated" events the rule only fires when a condition field actually changed (transition semantics).
- create_record data values may use {{field}} templates that interpolate the triggering record's fields, plus {{recordId}} and {{entity}}.
- Use only fields that exist on the chosen entity. Prefer select-field values from the allowed options.
- Keep the rule minimal — express exactly what was asked, nothing more.`,
    tools: [
      {
        name: "save_automation_rule",
        description: "Save the drafted automation rule",
        strict: true,
        input_schema: buildRuleSchema() as never,
      },
    ],
    tool_choice: { type: "tool", name: "save_automation_rule" },
    messages: [{ role: "user", content: prompt }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to draft this rule — try rephrasing the request.");
  }
  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("The model did not produce a rule — try rephrasing the request.");
  }

  const raw = toolUse.input as Omit<AutomationDraft, "summary">;
  // Strict schemas can't express a free-form map, so create_record data
  // arrives as field/value pairs — fold them back into an object.
  const draft: Omit<AutomationDraft, "summary"> = {
    ...raw,
    actions: raw.actions.map((action) => {
      if (action.type === "create_record" && Array.isArray(action.data)) {
        return {
          ...action,
          data: Object.fromEntries(
            (action.data as { field: string; value: unknown }[]).map((p) => [p.field, p.value]),
          ),
        };
      }
      return action;
    }),
  };
  const errors = validateDraft(draft);
  if (errors.length > 0) {
    throw new Error(`The drafted rule has problems: ${errors.join("; ")}`);
  }
  return { ...draft, summary: summarizeDraft(draft) };
}
