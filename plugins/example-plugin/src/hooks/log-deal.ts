import type { HookContext } from "@meridian/core";

export async function logDealCreated(context: HookContext): Promise<void> {
  console.log(`[example-plugin] Deal created: ${context.recordId}`, context.data);
}

export const hooks: Record<string, (ctx: HookContext) => Promise<void>> = {
  "deal.onCreate": logDealCreated,
};
