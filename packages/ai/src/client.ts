import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export function resolveModel(model?: string): string {
  return model ?? process.env.MERIDIAN_LLM_MODEL ?? "claude-opus-5";
}

/** Extract the concatenated text blocks from a message response. */
export function messageText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}
