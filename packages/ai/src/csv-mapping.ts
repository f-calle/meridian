import { entityRegistry } from "@meridian/core";
import { getAnthropicClient, resolveModel } from "./client.js";

export interface CsvMappingDraft {
  entity: string;
  mapping: { column: string; field: string }[];
  externalIdColumn?: string;
  /** Columns the model judged unmappable, with a reason each */
  unmapped: { column: string; reason: string }[];
}

function entityCatalog(): string {
  return entityRegistry
    .list()
    .map((e) => {
      const fields = Object.entries(e.fields)
        .map(([name, def]) => `${name} (${def.type}${def.required ? ", required" : ""})`)
        .join("; ");
      return `- ${e.name}: ${fields}`;
    })
    .join("\n");
}

/** Validate a mapping draft against real headers and the entity registry. */
export function validateCsvMapping(
  draft: Omit<CsvMappingDraft, "unmapped"> & { unmapped?: CsvMappingDraft["unmapped"] },
  headers: string[],
): string[] {
  const errors: string[] = [];
  const entity = entityRegistry.get(draft.entity);
  if (!entity) return [`Unknown entity: ${draft.entity}`];
  if (draft.mapping.length === 0) errors.push("No columns were mapped");
  for (const m of draft.mapping) {
    if (!headers.includes(m.column)) errors.push(`Mapped column "${m.column}" is not in the CSV`);
    if (!entity.fields[m.field]) errors.push(`Mapped field "${m.field}" does not exist on ${draft.entity}`);
  }
  if (draft.externalIdColumn && !headers.includes(draft.externalIdColumn)) {
    errors.push(`External ID column "${draft.externalIdColumn}" is not in the CSV`);
  }
  return errors;
}

/**
 * Propose a column→field mapping for an arbitrary CSV. Handles renamed and
 * custom columns (e.g. Odoo Studio x_ fields) by reading headers + sample
 * rows instead of relying on known export formats.
 */
export async function draftCsvMapping(
  headers: string[],
  sampleRows: Record<string, string>[],
  targetEntity?: string,
  model?: string,
): Promise<CsvMappingDraft> {
  const entityNames = entityRegistry.list().map((e) => e.name);
  const sample = sampleRows
    .slice(0, 3)
    .map((row) => headers.map((h) => `${h}=${JSON.stringify(row[h] ?? "")}`).join(", "))
    .join("\n");

  const response = await getAnthropicClient().messages.create({
    model: resolveModel(model),
    max_tokens: 16000,
    system: `You map CSV columns onto Meridian ERP entity fields for a data import.
Call save_mapping exactly once.

Entities and their fields:
${entityCatalog()}

Rules:
- Pick the single entity that best fits the data${targetEntity ? ` (the user chose: ${targetEntity})` : ""}.
- Map each CSV column to at most one field; leave columns you cannot map out of "mapping" and list them in "unmapped" with a short reason.
- If a column looks like a stable source ID (id, ref, external id), set it as externalIdColumn so re-imports update instead of duplicating.
- Prefer obvious semantic matches over forced ones; an unmapped column is better than a wrong mapping.`,
    tools: [
      {
        name: "save_mapping",
        description: "Save the proposed CSV column mapping",
        strict: true,
        input_schema: {
          type: "object",
          properties: {
            entity: { type: "string", enum: entityNames },
            mapping: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  column: { type: "string", enum: headers },
                  field: { type: "string" },
                },
                required: ["column", "field"],
                additionalProperties: false,
              },
            },
            externalIdColumn: { type: "string", enum: headers },
            unmapped: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  column: { type: "string", enum: headers },
                  reason: { type: "string" },
                },
                required: ["column", "reason"],
                additionalProperties: false,
              },
            },
          },
          required: ["entity", "mapping", "unmapped"],
          additionalProperties: false,
        } as never,
      },
    ],
    tool_choice: { type: "tool", name: "save_mapping" },
    messages: [
      {
        role: "user",
        content: `CSV headers: ${headers.join(", ")}\n\nSample rows:\n${sample || "(none)"}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to map this file.");
  }
  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("The model did not produce a mapping.");
  }

  const draft = toolUse.input as CsvMappingDraft;
  const errors = validateCsvMapping(draft, headers);
  if (errors.length > 0) {
    throw new Error(`The proposed mapping has problems: ${errors.join("; ")}`);
  }
  return draft;
}
