import { getEntityUiMeta } from "@meridian/core";
import type { EntityDefinition } from "@meridian/core";

export interface FormFieldConfig {
  name: string;
  type: string;
  label: string;
  required?: boolean;
  options?: string[];
  relation?: string;
}

export interface EntityFormConfig {
  name: string;
  label: string;
  pluralLabel: string;
  fields: FormFieldConfig[];
  jsonSchema: Record<string, unknown>;
}

export function getFormConfig(entity: EntityDefinition): EntityFormConfig {
  const meta = getEntityUiMeta(entity);
  return {
    name: meta.name,
    label: meta.label,
    pluralLabel: meta.pluralLabel,
    fields: meta.fields.map((f) => ({
      name: f.name,
      type: f.type,
      label: f.label ?? f.name,
      required: f.required,
      options: f.options,
      relation: f.relation,
    })),
    jsonSchema: meta.jsonSchema,
  };
}

export function getListColumns(entity: EntityDefinition): FormFieldConfig[] {
  const meta = getEntityUiMeta(entity);
  return meta.fields
    .filter((f) => f.type !== "text" && f.type !== "json")
    .slice(0, 6)
    .map((f) => ({
      name: f.name,
      type: f.type,
      label: f.label ?? f.name,
      required: f.required,
      options: f.options,
      relation: f.relation,
    }));
}

export { getEntityUiMeta };
