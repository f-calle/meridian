import { EventEmitter } from "node:events";
import type { HookContext, HookHandler, LifecycleEvent } from "../types.js";

export class EventBus extends EventEmitter {
  emitLifecycle(event: LifecycleEvent, context: HookContext): void {
    this.emit(`${context.entityName}.${event}`, context);
    this.emit(`*.${event}`, context);
  }

  onLifecycle(entityName: string, event: LifecycleEvent, handler: (ctx: HookContext) => void): void {
    this.on(`${entityName}.${event}`, handler);
  }
}

export const eventBus = new EventBus();

export class HookRegistry {
  private hooks = new Map<string, HookHandler[]>();

  register(key: string, handler: HookHandler): void {
    const existing = this.hooks.get(key) ?? [];
    existing.push(handler);
    this.hooks.set(key, existing);
  }

  async run(key: string, context: HookContext): Promise<void> {
    const handlers = this.hooks.get(key) ?? [];
    for (const handler of handlers) {
      await handler(context);
    }
  }

  async runLifecycle(
    entityName: string,
    event: LifecycleEvent,
    context: HookContext,
  ): Promise<void> {
    await this.run(`${entityName}.${event}`, context);
    eventBus.emitLifecycle(event, context);
  }

  list(): string[] {
    return Array.from(this.hooks.keys());
  }
}

export const hookRegistry = new HookRegistry();
