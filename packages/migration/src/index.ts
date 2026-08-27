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
  odooModel?: string;
  /** Total matching records in the source system (for coverage %) */
  sourceCount?: number;
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
  /** Known gaps, stated plainly so coverage claims are honest */
  limitations?: string[];
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
    odooModel: "product.template",
    meridianEntity: "product",
    fields: [
      { odooField: "name", meridianField: "name" },
      { odooField: "default_code", meridianField: "sku", transform: (v) => String(v) },
      { odooField: "list_price", meridianField: "price" },
      { odooField: "standard_price", meridianField: "cost" },
      { odooField: "description_sale", meridianField: "description", transform: (v) => String(v) },
      { odooField: "active", meridianField: "active" },
    ],
  },
  {
    odooModel: "sale.order",
    meridianEntity: "quote",
    fields: [
      { odooField: "name", meridianField: "number" },
      { odooField: "partner_id", meridianField: "companyId", transform: firstOfPair, relation: "company" },
      { odooField: "date_order", meridianField: "issueDate", transform: odooDate },
      { odooField: "validity_date", meridianField: "expiryDate", transform: odooDate },
      { odooField: "amount_untaxed", meridianField: "subtotal" },
      { odooField: "amount_tax", meridianField: "tax" },
      { odooField: "amount_total", meridianField: "total" },
      { odooField: "state", meridianField: "status", transform: mapOdooQuoteStatus },
    ],
  },
  {
    odooModel: "account.move",
    meridianEntity: "invoice",
    filter: { move_type: "out_invoice" },
    fields: [
      { odooField: "name", meridianField: "number" },
      { odooField: "partner_id", meridianField: "companyId", transform: firstOfPair, relation: "company" },
      { odooField: "invoice_date", meridianField: "issueDate", transform: odooDate },
      { odooField: "invoice_date_due", meridianField: "dueDate", transform: odooDate },
      { odooField: "amount_untaxed", meridianField: "subtotal" },
      { odooField: "amount_tax", meridianField: "tax" },
      { odooField: "amount_total", meridianField: "total" },
      { odooField: "payment_state", meridianField: "status", transform: mapOdooInvoiceStatus },
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

/** Odoo many2one values arrive as [id, display_name]. */
function firstOfPair(v: unknown): unknown {
  return Array.isArray(v) ? v[0] : v;
}

/** Odoo date/datetime strings → ISO date (YYYY-MM-DD). */
function odooDate(v: unknown): string {
  return String(v).slice(0, 10);
}

function mapOdooQuoteStatus(state: unknown): string {
  const map: Record<string, string> = {
    draft: "draft",
    sent: "sent",
    sale: "accepted",
    done: "accepted",
    cancel: "declined",
  };
  return map[String(state)] ?? "draft";
}

function mapOdooInvoiceStatus(paymentState: unknown): string {
  const map: Record<string, string> = {
    not_paid: "sent",
    in_payment: "partial",
    partial: "partial",
    paid: "paid",
    reversed: "cancelled",
  };
  return map[String(paymentState)] ?? "draft";
}

export const ODOO_IMPORT_LIMITATIONS = [
  "File attachments stay in Odoo — chatter text is imported, the files it references are not.",
  "Accounting entries (journals, taxes, payments) are out of scope; invoices arrive as documents with their line items and totals.",
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
