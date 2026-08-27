import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

/**
 * Meridian runs several different AI jobs, and they don't need the same model.
 * Each task gets the cheapest tier that does it well, so the UI stays snappy:
 *
 *  - briefing: summarise a small JSON blob into a few sentences → Haiku
 *  - drafting/mapping: structured extraction against a known schema → Sonnet
 *  - chat: multi-step agentic tool loop over business data → Sonnet
 *
 * Every task is overridable per-environment, and MERIDIAN_LLM_MODEL still
 * overrides all of them for a global pin.
 */
export type AiTask = "briefing" | "chat" | "automation-draft" | "csv-mapping";

const TASK_DEFAULTS: Record<AiTask, string> = {
  briefing: "claude-haiku-4-5",
  chat: "claude-sonnet-5",
  "automation-draft": "claude-sonnet-5",
  "csv-mapping": "claude-sonnet-5",
};

const TASK_ENV: Record<AiTask, string> = {
  briefing: "MERIDIAN_LLM_MODEL_BRIEFING",
  chat: "MERIDIAN_LLM_MODEL_CHAT",
  "automation-draft": "MERIDIAN_LLM_MODEL_AUTOMATION",
  "csv-mapping": "MERIDIAN_LLM_MODEL_MAPPING",
};

/** Explicit argument > per-task env > global pin > task default. */
export function resolveModel(model?: string, task: AiTask = "chat"): string {
  return (
    model ??
    process.env[TASK_ENV[task]] ??
    process.env.MERIDIAN_LLM_MODEL ??
    TASK_DEFAULTS[task]
  );
}

/** Extract the concatenated text blocks from a message response. */
export function messageText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}
