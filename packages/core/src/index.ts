export { defineEntity, field } from "./entity/define-entity.js";
export { entityRegistry, registerEntities } from "./entity/registry.js";
export { entityToJsonSchema, getEntityUiMeta } from "./entity/json-schema.js";
export { validateEntityData, buildEntityZodSchema } from "./entity/validation.js";
export { checkPermission, getEffectivePermissions, PermissionError } from "./acl/permissions.js";
export { eventBus, hookRegistry } from "./events/event-bus.js";
export { pluginManager, PluginManager } from "./plugins/plugin-manager.js";
export { entityService, EntityService } from "./services/entity-service.js";
export { hashPassword, verifyPassword, isLegacyHash } from "./auth/password.js";
export { signToken, verifyToken } from "./auth/token.js";
export type { TokenPayload } from "./auth/token.js";
export {
  startAutomationEngine,
  evaluateConditions,
  ruleMatches,
  interpolate,
  clearAutomationCache,
} from "./automations/engine.js";
export type { AutomationRule, AutomationCondition, AutomationAction } from "./automations/engine.js";
export { getDb, closeDb } from "./db/client.js";
export { syncEntityTables } from "./db/entity-store.js";
export { closeSql } from "./db/raw-sql.js";
export type * from "./types.js";
