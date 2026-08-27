import type { EntityDefinition, FieldDefinition } from "../types.js";

export function entityToJsonSchema(entity: EntityDefinition): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [name, fieldDef] of Object.entries(entity.fields)) {
    properties[name] = fieldToJsonSchemaProperty(fieldDef);
    if (fieldDef.required) {
      required.push(name);
    }
  }

  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: entity.label,
    type: "object",
    properties,
    required: required.length > 0 ? required : undefined,
  };
}

function fieldToJsonSchemaProperty(fieldDef: FieldDefinition): Record<string, unknown> {
  const base: Record<string, unknown> = { title: fieldDef.label };

  switch (fieldDef.type) {
    case "string":
    case "email":
    case "phone":
    case "text":
      return { ...base, type: "string" };
    case "number":
    case "currency":
      return { ...base, type: "number" };
    case "boolean":
      return { ...base, type: "boolean" };
    case "date":
      return { ...base, type: "string", format: "date" };
    case "datetime":
      return { ...base, type: "string", format: "date-time" };
    case "select":
      return { ...base, type: "string", enum: fieldDef.options ?? [] };
    case "multiselect":
      return { ...base, type: "array", items: { type: "string", enum: fieldDef.options ?? [] } };
    case "relation":
      return { ...base, type: "string", format: "uuid", "x-relation": fieldDef.relation };
    case "json":
      return { ...base, type: "object" };
    default:
      return { ...base, type: "string" };
  }
}

export function getEntityUiMeta(entity: EntityDefinition) {
  return {
    name: entity.name,
    label: entity.label,
    pluralLabel: entity.pluralLabel ?? `${entity.label}s`,
    fields: Object.entries(entity.fields).map(([name, def]) => ({
      name,
      ...def,
    })),
    jsonSchema: entityToJsonSchema(entity),
  };
}
