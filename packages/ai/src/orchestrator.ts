import { generateText, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { ActorContext, EntityDefinition } from "@meridian/core";
import { entityRegistry, entityService } from "@meridian/core";

const SYSTEM_PROMPT = `You are Meridian AI, an intelligent ERP assistant.
You help users manage CRM, projects, and business data through natural language.
Always use the provided tools to read and modify data — never invent data.
Use the aggregate tool for questions about totals, counts, or breakdowns (e.g. "pipeline value by stage").
Deleting records requires the user to explicitly confirm; ask before calling delete with confirm=true.
When an operation fails, explain the error and suggest a correction.
Be concise, professional, and action-oriented.`;

/** Human-readable field reference embedded in tool descriptions so the model
 * knows each entity's shape without a discovery round-trip. */
function describeFields(entity: EntityDefinition): string {
  return Object.entries(entity.fields)
    .map(([name, def]) => {
      const parts: string[] = [def.type];
      if (def.required) parts.push("required");
      if (def.options?.length) parts.push(`one of: ${def.options.join("|")}`);
      if (def.relation) parts.push(`id of a ${def.relation}`);
      return `${name} (${parts.join(", ")})`;
    })
    .join("; ");
}

export class AgentOrchestrator {
  private actor: ActorContext;
  private model: string;

  constructor(actor: ActorContext, model?: string) {
    this.actor = actor;
    this.model = model ?? process.env.MERIDIAN_LLM_MODEL ?? "claude-sonnet-4-20250514";
  }

  async chat(message: string, history: { role: "user" | "assistant"; content: string }[] = []) {
    const tools = this.buildTools();

    const result = await generateText({
      model: anthropic(this.model),
      system: SYSTEM_PROMPT,
      messages: [
        ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: message },
      ],
      tools: tools as Parameters<typeof generateText>[0]["tools"],
      maxSteps: 8,
    });

    return {
      response: result.text,
      toolCalls: result.steps.flatMap((s) => s.toolCalls ?? []),
      usage: result.usage,
    };
  }

  private buildTools() {
    const entityNames = entityRegistry.list().map((e) => e.name) as [string, ...string[]];
    const entityTools: Record<string, unknown> = {};

    for (const entity of entityRegistry.list()) {
      const fieldDocs = describeFields(entity);

      entityTools[`list_${entity.name}`] = tool({
        description: `List ${entity.pluralLabel ?? entity.label + "s"}. Filterable fields: ${fieldDocs}`,
        parameters: z.object({
          search: z.string().optional().describe("Free-text search"),
          filters: z
            .record(z.unknown())
            .optional()
            .describe("Exact-match filters, e.g. {\"stage\": \"won\"}"),
          sortBy: z.string().optional().describe("Field name to sort by"),
          sortOrder: z.enum(["asc", "desc"]).optional(),
          page: z.number().optional(),
        }),
        execute: async ({ search, filters, sortBy, sortOrder, page }) =>
          entityService.list(
            entity.name,
            { tenantId: this.actor.tenantId, search, filters, sortBy, sortOrder, page },
            this.actor,
          ),
      });

      entityTools[`read_${entity.name}`] = tool({
        description: `Read a single ${entity.label} by ID`,
        parameters: z.object({ id: z.string() }),
        execute: async ({ id }) => entityService.read(entity.name, id, this.actor),
      });

      entityTools[`create_${entity.name}`] = tool({
        description: `Create a new ${entity.label}. Fields: ${fieldDocs}`,
        parameters: z.object({
          data: z.record(z.unknown()).describe("Field values keyed by field name"),
        }),
        execute: async ({ data }) => entityService.create(entity.name, data, this.actor),
      });

      entityTools[`update_${entity.name}`] = tool({
        description: `Update a ${entity.label}. Fields: ${fieldDocs}`,
        parameters: z.object({
          id: z.string(),
          data: z.record(z.unknown()),
        }),
        execute: async ({ id, data }) => entityService.update(entity.name, id, data, this.actor),
      });
    }

    entityTools.aggregate = tool({
      description:
        "Aggregate records: count, sum, or average, optionally grouped by a field. " +
        "Use for questions like 'total pipeline value by stage' or 'how many open tasks'.",
      parameters: z.object({
        entity: z.enum(entityNames),
        groupBy: z.string().optional().describe("Field to group by"),
        metric: z.enum(["count", "sum", "avg"]).optional(),
        metricField: z.string().optional().describe("Numeric field for sum/avg"),
        filters: z.record(z.unknown()).optional(),
      }),
      execute: async ({ entity, groupBy, metric, metricField, filters }) =>
        entityService.aggregate(entity, { groupBy, metric, metricField, filters }, this.actor),
    });

    entityTools.delete_record = tool({
      description:
        "Permanently delete a record. Only call with confirm=true after the user has explicitly confirmed the deletion.",
      parameters: z.object({
        entity: z.enum(entityNames),
        id: z.string(),
        confirm: z.boolean().describe("Must be true; only after explicit user confirmation"),
      }),
      execute: async ({ entity, id, confirm }) => {
        if (!confirm) return { error: "Deletion not confirmed. Ask the user to confirm first." };
        await entityService.delete(entity, id, this.actor);
        return { deleted: true, entity, id };
      },
    });

    return entityTools;
  }
}
