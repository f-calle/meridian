import type { ActorContext } from "@meridian/core";
import { entityRegistry, entityService } from "@meridian/core";
import type { ImportResult } from "./index.js";

export interface CsvColumnMapping {
  /** CSV header name */
  column: string;
  /** Meridian entity field name */
  field: string;
}

export interface CsvImportOptions {
  entity: string;
  mapping: CsvColumnMapping[];
  /** CSV column holding a stable source ID; enables idempotent re-imports */
  externalIdColumn?: string;
  sourceSystem?: string;
  dryRun?: boolean;
}

export interface CsvPreset {
  name: string;
  label: string;
  description: string;
  entity: string;
  sourceSystem: string;
  mapping: CsvColumnMapping[];
  externalIdColumn?: string;
}

/** RFC-4180-ish CSV parser: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const records: string[][] = [];
  let current: string[] = [];
  let value = "";
  let inQuotes = false;
  let i = 0;

  const pushValue = () => {
    current.push(value);
    value = "";
  };
  const pushRecord = () => {
    pushValue();
    // Skip fully empty lines
    if (current.length > 1 || current[0] !== "") records.push(current);
    current = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      value += ch;
      i++;
      continue;
    }
    if (ch === '"' && value === "") {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      pushValue();
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      pushRecord();
      i++;
      continue;
    }
    value += ch;
    i++;
  }
  if (value !== "" || current.length > 0) pushRecord();

  const first = records[0];
  if (!first) return { headers: [], rows: [] };

  const headers = first.map((h) => h.trim());
  const rows = records.slice(1).map((record) => {
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = record[idx] ?? "";
    });
    return row;
  });

  return { headers, rows };
}

/** Coerce a raw CSV string into the target field's type. */
function coerceValue(raw: string, fieldType: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;

  switch (fieldType) {
    case "number":
    case "currency": {
      const n = Number(trimmed.replace(/[$,\s]/g, ""));
      return Number.isNaN(n) ? undefined : n;
    }
    case "boolean":
      return ["1", "true", "yes", "y"].includes(trimmed.toLowerCase());
    case "multiselect":
      return trimmed.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
    default:
      return trimmed;
  }
}

export async function importCsv(
  csvText: string,
  options: CsvImportOptions,
  actor: ActorContext,
): Promise<ImportResult> {
  const entity = entityRegistry.get(options.entity);
  if (!entity) throw new Error(`Unknown entity: ${options.entity}`);

  const result: ImportResult = {
    entity: options.entity,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  const { headers, rows } = parseCsv(csvText);
  if (rows.length === 0) {
    result.errors.push("CSV contains no data rows");
    return result;
  }

  const missing = options.mapping
    .map((m) => m.column)
    .filter((col) => !headers.includes(col));
  if (missing.length === options.mapping.length) {
    throw new Error(
      `None of the mapped columns exist in the CSV. Expected some of: ${options.mapping.map((m) => m.column).join(", ")}. Found: ${headers.join(", ")}`,
    );
  }

  const sourceSystem = options.sourceSystem ?? "csv";
  const canUpsert = Boolean(options.externalIdColumn && entity.externalId);

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    if (!row) continue;
    try {
      const data: Record<string, unknown> = {};
      for (const m of options.mapping) {
        const raw = row[m.column];
        if (raw === undefined) continue;
        const fieldDef = entity.fields[m.field];
        if (!fieldDef) throw new Error(`Unknown field in mapping: ${m.field}`);
        const coerced = coerceValue(raw, fieldDef.type);
        if (coerced !== undefined) data[m.field] = coerced;
      }

      if (Object.keys(data).length === 0) {
        result.skipped++;
        continue;
      }

      if (options.dryRun) {
        result.created++;
        continue;
      }

      const externalId = options.externalIdColumn
        ? row[options.externalIdColumn]?.trim()
        : undefined;
      if (canUpsert && externalId) {
        await entityService.upsertByExternalId(options.entity, externalId, sourceSystem, data, actor);
        result.created++;
      } else {
        await entityService.create(options.entity, data, actor);
        result.created++;
      }
    } catch (err) {
      result.skipped++;
      result.errors.push(`Row ${rowIdx + 2}: ${(err as Error).message}`);
      if (result.errors.length >= 50) {
        result.errors.push("Too many errors, aborting import");
        break;
      }
    }
  }

  return result;
}

/**
 * Starting-point column mappings for common ERP CSV exports. Column names
 * match each system's default export; users can adjust before importing.
 */
export const CSV_PRESETS: CsvPreset[] = [
  {
    name: "erpnext-contact",
    label: "ERPNext — Contacts",
    description: "ERPNext Contact list export (Data Export → Contact)",
    entity: "contact",
    sourceSystem: "erpnext",
    externalIdColumn: "ID",
    mapping: [
      { column: "First Name", field: "firstName" },
      { column: "Last Name", field: "lastName" },
      { column: "Email Id", field: "email" },
      { column: "Mobile No", field: "phone" },
      { column: "Designation", field: "title" },
    ],
  },
  {
    name: "erpnext-customer",
    label: "ERPNext — Customers",
    description: "ERPNext Customer list export",
    entity: "company",
    sourceSystem: "erpnext",
    externalIdColumn: "ID",
    mapping: [
      { column: "Customer Name", field: "name" },
      { column: "Email Id", field: "email" },
      { column: "Mobile No", field: "phone" },
      { column: "Website", field: "website" },
    ],
  },
  {
    name: "erpnext-lead",
    label: "ERPNext — Leads",
    description: "ERPNext Lead list export, imported as deals",
    entity: "deal",
    sourceSystem: "erpnext",
    externalIdColumn: "ID",
    mapping: [
      { column: "Lead Name", field: "title" },
      { column: "Annual Revenue", field: "value" },
    ],
  },
  {
    name: "dolibarr-thirdparty",
    label: "Dolibarr — Third parties",
    description: "Dolibarr societe (third party) export",
    entity: "company",
    sourceSystem: "dolibarr",
    externalIdColumn: "s.rowid",
    mapping: [
      { column: "s.nom", field: "name" },
      { column: "s.email", field: "email" },
      { column: "s.phone", field: "phone" },
      { column: "s.url", field: "website" },
      { column: "s.address", field: "address" },
    ],
  },
  {
    name: "generic-contacts",
    label: "Generic — Contacts",
    description: "Any CSV with first_name, last_name, email, phone columns",
    entity: "contact",
    sourceSystem: "csv",
    mapping: [
      { column: "first_name", field: "firstName" },
      { column: "last_name", field: "lastName" },
      { column: "email", field: "email" },
      { column: "phone", field: "phone" },
    ],
  },
];
