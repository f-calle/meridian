import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import type { ActorContext, EntityDefinition } from "@meridian/core";
import { entityRegistry, entityService } from "@meridian/core";
import { getAnthropicClient, resolveModel, messageText } from "./client.js";

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
    this.model = resolveModel(model);
  }

  async chat(message: string, history: { role: "user" | "assistant"; content: string }[] = []) {
    const toolCalls: { toolName: string; args: unknown }[] = [];
    const tools = this.buildTools(toolCalls);

    const finalMessage = await getAnthropicClient().beta.messages.toolRunner({
      model: this.model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: message },
      ],
      tools,
      max_iterations: 8,
    });

    return {
      response: messageText(finalMessage.content as Parameters<typeof messageText>[0]),
      toolCalls,
      usage: finalMessage.usage,
    };
  }

  private buildTools(toolCalls: { toolName: string; args: unknown }[]) {
    const entityNames = entityRegistry.list().map((e) => e.name);
    const track = (toolName: string, args: unknown) => toolCalls.push({ toolName, args });
    const asResult = (value: unknown) => JSON.stringify(value);
    const asError = (err: unknown) => JSON.stringify({ error: (err as Error).message });

    const tools = [];

    for (const entity of entityRegistry.list()) {
      const fieldDocs = describeFields(entity);

      tools.push(
        betaTool({
          name: `list_${entity.name}`,
          description: `List ${entity.pluralLabel ?? entity.label + "s"}. Filterable fields: ${fieldDocs}`,
          inputSchema: {
            type: "object",
            properties: {
              search: { type: "string", description: "Free-text search" },
              filters: {
                type: "object",
                description: 'Exact-match filters, e.g. {"stage": "won"}',
              },
              sortBy: { type: "string", description: "Field name to sort by" },
              sortOrder: { type: "string", enum: ["asc", "desc"] },
              page: { type: "number" },
            },
          },
          run: async (input: {
            search?: string;
            filters?: Record<string, unknown>;
            sortBy?: string;
            sortOrder?: "asc" | "desc";
            page?: number;
          }) => {
            track(`list_${entity.name}`, input);
            try {
              return asResult(
                await entityService.list(
                  entity.name,
                  { tenantId: this.actor.tenantId, ...input },
                  this.actor,
                ),
              );
            } catch (err) {
              return asError(err);
            }
          },
        }),
        betaTool({
          name: `read_${entity.name}`,
          description: `Read a single ${entity.label} by ID`,
          inputSchema: {
            type: "object",
            properties: { id: { type: "string" } },
            required: ["id"],
          },
          run: async (input: { id: string }) => {
            track(`read_${entity.name}`, input);
            try {
              return asResult(await entityService.read(entity.name, input.id, this.actor));
            } catch (err) {
              return asError(err);
            }
          },
        }),
        betaTool({
          name: `create_${entity.name}`,
          description: `Create a new ${entity.label}. Fields: ${fieldDocs}`,
          inputSchema: {
            type: "object",
            properties: {
              data: { type: "object", description: "Field values keyed by field name" },
            },
            required: ["data"],
          },
          run: async (input: { data: Record<string, unknown> }) => {
            track(`create_${entity.name}`, input);
            try {
              return asResult(await entityService.create(entity.name, input.data, this.actor));
            } catch (err) {
              return asError(err);
            }
          },
        }),
        betaTool({
          name: `update_${entity.name}`,
          description: `Update a ${entity.label}. Fields: ${fieldDocs}`,
          inputSchema: {
            type: "object",
            properties: {
              id: { type: "string" },
              data: { type: "object" },
            },
            required: ["id", "data"],
          },
          run: async (input: { id: string; data: Record<string, unknown> }) => {
            track(`update_${entity.name}`, input);
            try {
              return asResult(
                await entityService.update(entity.name, input.id, input.data, this.actor),
              );
            } catch (err) {
              return asError(err);
            }
          },
        }),
      );
    }

    tools.push(
      betaTool({
        name: "aggregate",
        description:
          "Aggregate records: count, sum, or average, optionally grouped by a field. " +
          "Use for questions like 'total pipeline value by stage' or 'how many open tasks'.",
        inputSchema: {
          type: "object",
          properties: {
            entity: { type: "string", enum: entityNames },
            groupBy: { type: "string", description: "Field to group by" },
            metric: { type: "string", enum: ["count", "sum", "avg"] },
            metricField: { type: "string", description: "Numeric field for sum/avg" },
            filters: { type: "object" },
          },
          required: ["entity"],
        },
        run: async (input: {
          entity: string;
          groupBy?: string;
          metric?: "count" | "sum" | "avg";
          metricField?: string;
          filters?: Record<string, unknown>;
        }) => {
          track("aggregate", input);
          try {
            const { entity, ...options } = input;
            return asResult(await entityService.aggregate(entity, options, this.actor));
          } catch (err) {
            return asError(err);
          }
        },
      }),
      betaTool({
        name: "delete_record",
        description:
          "Permanently delete a record. Only call with confirm=true after the user has explicitly confirmed the deletion.",
        inputSchema: {
          type: "object",
          properties: {
            entity: { type: "string", enum: entityNames },
            id: { type: "string" },
            confirm: {
              type: "boolean",
              description: "Must be true; only after explicit user confirmation",
            },
          },
          required: ["entity", "id", "confirm"],
        },
        run: async (input: { entity: string; id: string; confirm: boolean }) => {
          track("delete_record", input);
          if (!input.confirm) {
            return JSON.stringify({ error: "Deletion not confirmed. Ask the user to confirm first." });
          }
          try {
            await entityService.delete(input.entity, input.id, this.actor);
            return asResult({ deleted: true, entity: input.entity, id: input.id });
          } catch (err) {
            return asError(err);
          }
        },
      }),
    );

    return tools;
  }
}
