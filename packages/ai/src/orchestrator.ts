import { generateText, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { ActorContext } from "@meridian/core";
import { entityRegistry, entityService } from "@meridian/core";

const SYSTEM_PROMPT = `You are Meridian AI, an intelligent ERP assistant.
You help users manage CRM, projects, and business data through natural language.
Always use the provided tools to read and modify data — never invent data.
When an operation fails, explain the error and suggest a correction.
Be concise, professional, and action-oriented.`;

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
      maxSteps: 5,
    });

    return {
      response: result.text,
      toolCalls: result.steps.flatMap((s) => s.toolCalls ?? []),
      usage: result.usage,
    };
  }

  private buildTools() {
    const entityTools: Record<string, unknown> = {};

    for (const entity of entityRegistry.list()) {
      entityTools[`list_${entity.name}`] = tool({
        description: `List ${entity.pluralLabel ?? entity.label + "s"}`,
        parameters: z.object({
          search: z.string().optional(),
          page: z.number().optional(),
        }),
        execute: async ({ search, page }) =>
          entityService.list(
            entity.name,
            { tenantId: this.actor.tenantId, search, page },
            this.actor,
          ),
      });

      entityTools[`create_${entity.name}`] = tool({
        description: `Create a new ${entity.label}`,
        parameters: z.object({
          data: z.record(z.unknown()),
        }),
        execute: async ({ data }) => entityService.create(entity.name, data, this.actor),
      });

      entityTools[`update_${entity.name}`] = tool({
        description: `Update a ${entity.label}`,
        parameters: z.object({
          id: z.string(),
          data: z.record(z.unknown()),
        }),
        execute: async ({ id, data }) => entityService.update(entity.name, id, data, this.actor),
      });
    }

    return entityTools;
  }
}
