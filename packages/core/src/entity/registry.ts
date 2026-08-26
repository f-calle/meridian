import type { EntityDefinition, EntityRegistry } from "../types.js";

class EntityRegistryImpl implements EntityRegistry {
  entities = new Map<string, EntityDefinition>();

  register(entity: EntityDefinition): void {
    if (this.entities.has(entity.name)) {
      throw new Error(`Entity "${entity.name}" is already registered`);
    }
    this.entities.set(entity.name, entity);
  }

  get(name: string): EntityDefinition | undefined {
    return this.entities.get(name);
  }

  list(): EntityDefinition[] {
    return Array.from(this.entities.values());
  }
}

export const entityRegistry = new EntityRegistryImpl();

export function registerEntities(entities: EntityDefinition[]): void {
  for (const entity of entities) {
    entityRegistry.register(entity);
  }
}
