export interface OdooConfig {
  url: string;
  database: string;
  username: string;
  password: string;
}

export interface FieldMapping {
  odooField: string;
  meridianField: string;
  transform?: (value: unknown) => unknown;
  /** Target Meridian entity — the imported Odoo ID is resolved to the
   * matching record's UUID via its external_id after that entity imports. */
  relation?: string;
}

export interface ModelMapping {
  odooModel: string;
  meridianEntity: string;
  fields: FieldMapping[];
  filter?: Record<string, unknown>;
}

export interface ImportResult {
  entity: string;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export interface MigrationReport {
  jobId: string;
  source: string;
  status: "pending" | "running" | "completed" | "failed";
  results: ImportResult[];
  startedAt: Date;
  completedAt?: Date;
}

export const ODOO_MODEL_MAPPINGS: ModelMapping[] = [
  {
    odooModel: "res.partner",
    meridianEntity: "contact",
    fields: [
      { odooField: "name", meridianField: "firstName", transform: (v) => String(v).split(" ")[0] },
      { odooField: "name", meridianField: "lastName", transform: (v) => String(v).split(" ").slice(1).join(" ") || "" },
      { odooField: "email", meridianField: "email" },
      { odooField: "phone", meridianField: "phone" },
      { odooField: "function", meridianField: "title" },
    ],
    filter: { is_company: false },
  },
  {
    odooModel: "res.partner",
    meridianEntity: "company",
    fields: [
      { odooField: "name", meridianField: "name" },
      { odooField: "email", meridianField: "email" },
      { odooField: "phone", meridianField: "phone" },
      { odooField: "website", meridianField: "website" },
    ],
    filter: { is_company: true },
  },
  {
    odooModel: "crm.lead",
    meridianEntity: "deal",
    fields: [
      { odooField: "name", meridianField: "title" },
      { odooField: "expected_revenue", meridianField: "value" },
      { odooField: "stage_id", meridianField: "stage", transform: mapOdooStage },
      { odooField: "probability", meridianField: "probability" },
      { odooField: "date_deadline", meridianField: "expectedClose" },
    ],
  },
  {
    odooModel: "project.project",
    meridianEntity: "project",
    fields: [
      { odooField: "name", meridianField: "name" },
      { odooField: "description", meridianField: "description" },
    ],
  },
  {
    odooModel: "project.task",
    meridianEntity: "task",
    fields: [
      { odooField: "name", meridianField: "title" },
      { odooField: "description", meridianField: "description" },
      { odooField: "project_id", meridianField: "projectId", transform: (v) => (Array.isArray(v) ? v[0] : v), relation: "project" },
    ],
  },
];

function mapOdooStage(stage: unknown): string {
  const stageName = Array.isArray(stage) ? String(stage[1]).toLowerCase() : String(stage).toLowerCase();
  const stageMap: Record<string, string> = {
    new: "lead",
    qualified: "qualified",
    proposition: "proposal",
    proposal: "proposal",
    won: "won",
    lost: "lost",
  };
  for (const [key, value] of Object.entries(stageMap)) {
    if (stageName.includes(key)) return value;
  }
  return "lead";
}

export { OdooAdapter } from "./odoo-adapter.js";
export { parseCsv, importCsv, CSV_PRESETS } from "./csv-adapter.js";
export type { CsvColumnMapping, CsvImportOptions, CsvPreset } from "./csv-adapter.js";
