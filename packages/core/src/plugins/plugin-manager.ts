import type { PluginManifest, HookHandler } from "../types.js";
import { hookRegistry } from "../events/event-bus.js";
import { entityRegistry } from "../entity/registry.js";

export type PluginState = "installed" | "enabled" | "disabled";

export interface InstalledPlugin {
  manifest: PluginManifest;
  state: PluginState;
  handlers: Map<string, HookHandler>;
}

export class PluginManager {
  private plugins = new Map<string, InstalledPlugin>();

  install(manifest: PluginManifest, handlers: Record<string, HookHandler> = {}): void {
    for (const dep of manifest.depends ?? []) {
      if (!this.plugins.has(dep)) {
        throw new Error(`Plugin "${manifest.name}" depends on "${dep}" which is not installed`);
      }
    }

    const handlerMap = new Map(Object.entries(handlers));
    this.plugins.set(manifest.name, {
      manifest,
      state: "installed",
      handlers: handlerMap,
    });
  }

  enable(name: string): void {
    const plugin = this.getPlugin(name);
    plugin.state = "enabled";

    for (const [key, handler] of plugin.handlers) {
      hookRegistry.register(key, handler);
    }
  }

  disable(name: string): void {
    const plugin = this.getPlugin(name);
    plugin.state = "disabled";
  }

  uninstall(name: string): void {
    this.disable(name);
    this.plugins.delete(name);
  }

  list(): InstalledPlugin[] {
    return Array.from(this.plugins.values());
  }

  getPlugin(name: string): InstalledPlugin {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin "${name}" is not installed`);
    }
    return plugin;
  }

  getEntitySchemas(): ReturnType<typeof entityRegistry.list> {
    return entityRegistry.list();
  }
}

export const pluginManager = new PluginManager();
