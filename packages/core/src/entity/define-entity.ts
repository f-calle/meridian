import type { FieldDefinition } from "../types.js";

function baseField(type: FieldDefinition["type"], opts: Partial<FieldDefinition> = {}): FieldDefinition {
  return { type, ...opts };
}

export const field = {
  string: (opts: Partial<FieldDefinition> = {}) => baseField("string", { searchable: true, ...opts }),
  text: (opts: Partial<FieldDefinition> = {}) => baseField("text", opts),
  email: (opts: Partial<FieldDefinition> = {}) => baseField("email", { searchable: true, ...opts }),
  phone: (opts: Partial<FieldDefinition> = {}) => baseField("phone", opts),
  number: (opts: Partial<FieldDefinition> = {}) => baseField("number", opts),
  currency: (opts: Partial<FieldDefinition> = {}) => baseField("currency", opts),
  boolean: (opts: Partial<FieldDefinition> = {}) => baseField("boolean", opts),
  date: (opts: Partial<FieldDefinition> = {}) => baseField("date", opts),
  datetime: (opts: Partial<FieldDefinition> = {}) => baseField("datetime", opts),
  select: (options: string[], opts: Partial<FieldDefinition> = {}) =>
    baseField("select", { options, ...opts }),
  multiselect: (options: string[], opts: Partial<FieldDefinition> = {}) =>
    baseField("multiselect", { options, ...opts }),
  relation: (entity: string, opts: Partial<FieldDefinition> = {}) =>
    baseField("relation", { relation: entity, ...opts }),
  json: (opts: Partial<FieldDefinition> = {}) => baseField("json", opts),
};

export function defineEntity<T extends import("../types.js").EntityDefinition>(entity: T): T {
  return entity;
}
