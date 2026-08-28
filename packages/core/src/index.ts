export { defineEntity, field } from "./entity/define-entity.js";
export { entityRegistry, registerEntities } from "./entity/registry.js";
export { entityToJsonSchema, getEntityUiMeta } from "./entity/json-schema.js";
export { validateEntityData, buildEntityZodSchema } from "./entity/validation.js";
export { checkPermission, getEffectivePermissions, PermissionError, isPermissionError } from "./acl/permissions.js";
export { eventBus, hookRegistry } from "./events/event-bus.js";
export { pluginManager, PluginManager } from "./plugins/plugin-manager.js";
export { entityService, EntityService, coerceFromDb } from "./services/entity-service.js";
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
export {
  findReferences,
  detachReferences,
  inboundRelations,
  describeReferences,
  ReferentialIntegrityError,
  isReferentialIntegrityError,
} from "./services/references.js";
export type { Reference } from "./services/references.js";
export {
  isSessionCurrent,
  revokeSessions,
  currentTokenVersion,
  forgetSession,
  clearSessionCache,
} from "./auth/sessions.js";
export { collectAttention, rankAttention } from "./services/attention.js";
export { collectRelated } from "./services/related.js";
export { collectMetrics } from "./services/metrics.js";
export { OWED_INVOICE_STATUSES, owedInvoiceFilter } from "./services/money.js";
export type { DashboardMetrics } from "./services/metrics.js";
export type { RelatedGroup, RelatedRecords } from "./services/related.js";
export type { AttentionItem, AttentionKind, AttentionSummary } from "./services/attention.js";
export { compileFilters, parseFilterParams, isFilterOp, FILTER_OPS } from "./services/filters.js";
export type { FilterOp, FilterCondition } from "./services/filters.js";
export { deriveAccent, accentWarning, hslToHex, contrastRatio } from "./branding/accent.js";
export type { AccentVariant, AccentVariants } from "./branding/accent.js";
export { getDb, closeDb } from "./db/client.js";
export { expectedColumns, sqlTypeFor } from "./db/entity-store.js";
export { renderEntitySchema, drizzleColumnFor, tableConstName } from "./db/schema-codegen.js";
export { toColumnName } from "./db/naming.js";
export { runMigrations, seedDemoTenant } from "./db/bootstrap.js";
export { applyMigrations, migrationsFolder } from "./db/migrator.js";
export {
  describeSchemaDrift,
  formatSchemaDrift,
  assertSchemaMatchesRegistry,
  isDriftFree,
} from "./db/schema-check.js";
export type { SchemaDrift } from "./db/schema-check.js";
export { closeSql } from "./db/raw-sql.js";
export type * from "./types.js";
