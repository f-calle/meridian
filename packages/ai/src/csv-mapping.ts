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
  const client = getAnthropicClient();
  const resolvedModel = resolveModel(model, "csv-mapping");
  const sample = sampleRows
    .slice(0, 3)
    .map((row) => headers.map((h) => `${h}=${JSON.stringify(row[h] ?? "")}`).join(", "))
    .join("\n");
  const csvDescription = `CSV headers: ${headers.join(", ")}\n\nSample rows:\n${sample || "(none)"}`;

  // Stage 1 — settle the entity, so stage 2 can offer a concrete field menu.
  const entity = targetEntity ?? (await pickEntity(client, resolvedModel, csvDescription));
  const definition = entityRegistry.get(entity);
  if (!definition) throw new Error(`Unknown entity: ${entity}`);
  const fieldNames = Object.keys(definition.fields);

  // Stage 2 — map columns onto that entity's real fields (enum-constrained).
  const response = await client.messages.create({
    model: resolvedModel,
    max_tokens: 16000,
    system: `You map CSV columns onto the fields of the Meridian "${entity}" entity for a data import.
Call save_mapping exactly once.

Fields available on ${entity}:
${Object.entries(definition.fields)
  .map(([name, def]) => `- ${name} (${def.type}${def.required ? ", required" : ""}${def.options?.length ? `, one of: ${def.options.join("|")}` : ""})`)
  .join("\n")}

How to map:
- Match on meaning, not exact wording. Exports rename columns and prefix custom ones: "Mobile"/"Cell"/"Tel" is a phone, "x_job_title"/"Position"/"Role" is a job title, "Amount"/"Value"/"Revenue" is a monetary field. Strip x_ and custom_ prefixes and map on what remains.
- A combined column (e.g. "Full Name" where the entity has separate first/last fields) maps to the field holding the first part.
- Set externalIdColumn when a column is a stable source identifier (id, ref, code, external id), so re-imports update instead of duplicating.
- Map every column you reasonably can. List only genuinely unmappable columns in "unmapped" with a short reason.`,
    tools: [
      {
        name: "save_mapping",
        description: `Save the column mapping for ${entity}`,
        // Deliberately not strict: constrained decoding collapses this
        // enum-constrained array to a single item. validateCsvMapping +
        // withEveryColumnAccountedFor enforce correctness instead.
        input_schema: {
          type: "object",
          properties: {
            mapping: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  column: { type: "string", enum: headers },
                  field: { type: "string", enum: fieldNames },
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
          required: ["mapping", "unmapped"],
          additionalProperties: false,
        } as never,
      },
    ],
    tool_choice: { type: "tool", name: "save_mapping" },
    messages: [{ role: "user", content: csvDescription }],
  });

  if (response.stop_reason === "refusal") throw new Error("The model declined to map this file.");
  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("The model did not produce a mapping.");

  const draft: CsvMappingDraft = { entity, ...(toolUse.input as Omit<CsvMappingDraft, "entity">) };
  const errors = validateCsvMapping(draft, headers);
  if (errors.length > 0) {
    throw new Error(`The proposed mapping has problems: ${errors.join("; ")}`);
  }
  return withEveryColumnAccountedFor(draft, headers);
}

/** Stage 1: choose which entity this file describes. */
async function pickEntity(
  client: ReturnType<typeof getAnthropicClient>,
  model: string,
  csvDescription: string,
): Promise<string> {
  const entityNames = entityRegistry.list().map((e) => e.name);
  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: `Decide which Meridian entity a CSV file describes. Call choose_entity exactly once.

Entities:
${entityCatalog()}`,
    tools: [
      {
        name: "choose_entity",
        description: "Choose the entity this CSV maps onto",
        strict: true,
        input_schema: {
          type: "object",
          properties: { entity: { type: "string", enum: entityNames } },
          required: ["entity"],
          additionalProperties: false,
        } as never,
      },
    ],
    tool_choice: { type: "tool", name: "choose_entity" },
    messages: [{ role: "user", content: csvDescription }],
  });
  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("Could not determine which entity this file describes.");
  return (toolUse.input as { entity: string }).entity;
}

/**
 * Guarantee the reviewer sees every column: any header the model neither
 * mapped, named as the external id, nor explained gets listed as unmapped.
 * Enforced here rather than trusted to the prompt.
 */
export function withEveryColumnAccountedFor(
  draft: CsvMappingDraft,
  headers: string[],
): CsvMappingDraft {
  const accounted = new Set<string>([
    ...draft.mapping.map((m) => m.column),
    ...draft.unmapped.map((u) => u.column),
    ...(draft.externalIdColumn ? [draft.externalIdColumn] : []),
  ]);
  const missing = headers
    .filter((h) => !accounted.has(h))
    .map((column) => ({ column, reason: "no matching field — review and map by hand if needed" }));
  return missing.length === 0 ? draft : { ...draft, unmapped: [...draft.unmapped, ...missing] };
}
