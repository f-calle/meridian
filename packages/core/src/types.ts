export type FieldType =
  | "string"
  | "text"
  | "email"
  | "phone"
  | "number"
  | "currency"
  | "boolean"
  | "date"
  | "datetime"
  | "select"
  | "multiselect"
  | "relation"
  | "json";

export interface FieldDefinition {
  type: FieldType;
  label?: string;
  required?: boolean;
  unique?: boolean;
  default?: unknown;
  options?: string[];
  relation?: string;
  searchable?: boolean;
}

export interface PermissionMatrix {
  create: boolean;
  read: boolean;
  update: boolean;
  delete: boolean;
}

export interface EntityDefinition {
  name: string;
  label: string;
  pluralLabel?: string;
  fields: Record<string, FieldDefinition>;
  permissions: Record<string, PermissionMatrix>;
  lifecycle?: {
    onCreate?: string[];
    onUpdate?: string[];
    onDelete?: string[];
  };
  externalId?: boolean;
}

export interface EntityRegistry {
  entities: Map<string, EntityDefinition>;
  register(entity: EntityDefinition): void;
  get(name: string): EntityDefinition | undefined;
  list(): EntityDefinition[];
}

export interface AuditEntry {
  id: string;
  tenantId: string;
  entityName: string;
  recordId: string;
  action: "create" | "update" | "delete";
  actorId: string;
  actorType: "user" | "agent" | "system";
  diff: Record<string, unknown> | null;
  createdAt: Date;
}

export interface ActorContext {
  id: string;
  type: "user" | "agent" | "system";
  tenantId: string;
  role: string;
  permissions?: Record<string, PermissionMatrix>;
}

export interface PluginManifest {
  name: string;
  version: string;
  depends?: string[];
  entities?: string[];
  hooks?: Record<string, string>;
}

export interface HookHandler {
  (context: HookContext): Promise<void> | void;
}

export interface HookContext {
  entityName: string;
  recordId: string;
  data: Record<string, unknown>;
  actor: ActorContext;
  tenantId: string;
}

export type LifecycleEvent = "onCreate" | "onUpdate" | "onDelete";

export interface ListQuery {
  tenantId: string;
  page?: number;
  pageSize?: number;
  search?: string;
  filters?: Record<string, unknown>;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface ListResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
