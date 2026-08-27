import { z } from "zod";
import type { EntityDefinition, FieldDefinition } from "../types.js";

export function buildEntityZodSchema(entity: EntityDefinition): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [name, fieldDef] of Object.entries(entity.fields)) {
    shape[name] = fieldToZod(fieldDef);
  }

  return z.object(shape);
}

function fieldToZod(fieldDef: FieldDefinition): z.ZodTypeAny {
  let schema: z.ZodTypeAny;

  switch (fieldDef.type) {
    case "string":
    case "text":
    case "phone":
      schema = z.string();
      break;
    case "email":
      schema = z.string().email();
      break;
    case "number":
    case "currency":
      schema = z.number();
      break;
    case "boolean":
      schema = z.boolean();
      break;
    case "date":
    case "datetime":
      schema = z.string();
      break;
    case "select":
      schema = fieldDef.options?.length
        ? z.enum(fieldDef.options as [string, ...string[]])
        : z.string();
      break;
    case "multiselect":
      schema = z.array(z.string());
      break;
    case "relation":
      schema = z.string().uuid();
      break;
    case "json":
      // JSON fields hold either objects or arrays (e.g. pipeline stages,
      // automation conditions/actions).
      schema = z.union([z.record(z.unknown()), z.array(z.unknown())]);
      break;
    default:
      schema = z.unknown();
  }

  if (fieldDef.default !== undefined) {
    schema = schema.optional().default(fieldDef.default as never);
  } else if (!fieldDef.required) {
    schema = schema.optional().nullable();
  }

  return schema;
}

export function validateEntityData(
  entity: EntityDefinition,
  data: Record<string, unknown>,
  partial = false,
): { success: true; data: Record<string, unknown> } | { success: false; errors: string[] } {
  const schema = buildEntityZodSchema(entity);
  const validator = partial ? schema.partial() : schema;
  const result = validator.safeParse(data);

  if (!result.success) {
    return {
      success: false,
      errors: result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
    };
  }

  let output = result.data as Record<string, unknown>;
  if (partial) {
    // Field defaults still apply under .partial(); for updates that would
    // silently reset every omitted defaulted field. Keep only the keys the
    // caller actually sent.
    output = Object.fromEntries(Object.entries(output).filter(([key]) => key in data));
  }

  return { success: true, data: output };
}
