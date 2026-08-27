import xmlrpc from "xmlrpc";
import type { ActorContext } from "@meridian/core";
import { entityService, entityRegistry } from "@meridian/core";
import type { OdooConfig, ModelMapping, ImportResult, MigrationReport } from "./index.js";
import { ODOO_MODEL_MAPPINGS, ODOO_IMPORT_LIMITATIONS } from "./index.js";

export class OdooAdapter {
  private config: OdooConfig;
  private uid: number | null = null;

  constructor(config: OdooConfig) {
    this.config = config;
  }

  async connect(): Promise<boolean> {
    const common = xmlrpc.createSecureClient({ url: `${this.config.url}/xmlrpc/2/common` });
    return new Promise((resolve, reject) => {
      common.methodCall(
        "authenticate",
        [this.config.database, this.config.username, this.config.password, {}],
        (err, uid) => {
          if (err) reject(err);
          else {
            this.uid = uid as number;
            resolve(uid !== false);
          }
        },
      );
    });
  }

  async fetchModelCount(model: string, domain: unknown[][] = []): Promise<number> {
    if (!this.uid) await this.connect();

    const object = xmlrpc.createSecureClient({ url: `${this.config.url}/xmlrpc/2/object` });
    return new Promise((resolve, reject) => {
      object.methodCall(
        "execute_kw",
        [this.config.database, this.uid, this.config.password, model, "search_count", [domain]],
        (err, result) => {
          if (err) reject(err);
          else resolve(Number(result));
        },
      );
    });
  }

  static domainFor(mapping: ModelMapping): unknown[][] {
    return mapping.filter
      ? Object.entries(mapping.filter).map(([k, v]) => [k, "=", v] as unknown[])
      : [];
  }

  async searchRead(
    model: string,
    domain: unknown[][] = [],
    fields: string[] = [],
    limit = 100,
    offset = 0,
  ): Promise<Record<string, unknown>[]> {
    if (!this.uid) await this.connect();

    const object = xmlrpc.createSecureClient({ url: `${this.config.url}/xmlrpc/2/object` });

    return new Promise((resolve, reject) => {
      object.methodCall(
        "execute_kw",
        [
          this.config.database,
          this.uid,
          this.config.password,
          model,
          "search_read",
          [domain],
          { fields, limit, offset },
        ],
        (err, result) => {
          if (err) reject(err);
          else resolve(result as Record<string, unknown>[]);
        },
      );
    });
  }

  async importModel(
    mapping: ModelMapping,
    actor: ActorContext,
    dryRun = false,
  ): Promise<ImportResult> {
    const domain = OdooAdapter.domainFor(mapping);
    const result: ImportResult = {
      entity: mapping.meridianEntity,
      odooModel: mapping.odooModel,
      sourceCount: await this.fetchModelCount(mapping.odooModel, domain).catch(() => undefined),
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    const odooFields = mapping.fields.map((f) => f.odooField);
    const uniqueFields = [...new Set(odooFields), "id"];

    let offset = 0;
    const batchSize = 100;
    let hasMore = true;

    while (hasMore) {
      const records = await this.searchRead(
        mapping.odooModel,
        domain,
        uniqueFields,
        batchSize,
        offset,
      );

      if (records.length === 0) {
        hasMore = false;
        break;
      }

      for (const record of records) {
        try {
          const data = this.mapRecord(record, mapping);
          await this.resolveRelations(data, mapping, actor);
          const externalId = `odoo_${record.id}`;

          if (dryRun) {
            result.created++;
            continue;
          }

          const { created } = await entityService.upsertByExternalId(
            mapping.meridianEntity,
            externalId,
            "odoo",
            data,
            actor,
          );
          if (created) result.created++;
          else result.updated++;
        } catch (err) {
          result.errors.push(`Record ${record.id}: ${(err as Error).message}`);
          result.skipped++;
        }
      }

      offset += batchSize;
      if (records.length < batchSize) hasMore = false;
    }

    return result;
  }

  async runMigration(
    actor: ActorContext,
    models: string[] = ODOO_MODEL_MAPPINGS.map((m) => m.odooModel),
    dryRun = false,
  ): Promise<MigrationReport> {
    await this.connect();

    const report: MigrationReport = {
      jobId: crypto.randomUUID(),
      source: "odoo",
      status: "running",
      results: [],
      startedAt: new Date(),
    };

    const mappings = ODOO_MODEL_MAPPINGS.filter((m) => models.includes(m.odooModel));

    for (const mapping of mappings) {
      const result = await this.importModel(mapping, actor, dryRun);
      report.results.push(result);
    }

    // Child records depend on their parents already existing, so they run as
    // a second phase over what the mappings above just imported.
    if (!dryRun) {
      const importedEntities = new Set(mappings.map((m) => m.meridianEntity));
      if (importedEntities.has("quote")) {
        report.results.push(await this.importDocumentLines("quote", actor));
      }
      if (importedEntities.has("invoice")) {
        report.results.push(await this.importDocumentLines("invoice", actor));
      }
      report.results.push(await this.importChatter(actor, [...importedEntities]));
    }

    report.status = "completed";
    report.limitations = ODOO_IMPORT_LIMITATIONS;
    report.completedAt = new Date();
    return report;
  }

  /**
   * Map every already-imported record of `entity` back to its Odoo id, using
   * the external_id we stamped on import (`odoo_<id>`).
   */
  private async importedByOdooId(
    entity: string,
    actor: ActorContext,
  ): Promise<Map<number, Record<string, unknown>>> {
    const byOdooId = new Map<number, Record<string, unknown>>();
    let page = 1;
    for (;;) {
      const batch = await entityService.list(
        entity,
        { tenantId: actor.tenantId, filters: { sourceSystem: "odoo" }, page, pageSize: 200 },
        actor,
      );
      for (const record of batch.data) {
        const match = /^odoo_(\d+)$/.exec(String(record.externalId ?? ""));
        if (match) byOdooId.set(Number(match[1]), record);
      }
      if (batch.data.length < 200) break;
      page++;
    }
    return byOdooId;
  }

  /**
   * Import line-level detail for quotes (sale.order.line) and invoices
   * (account.move.line) onto the parent document's `lines` field.
   */
  async importDocumentLines(
    entity: "quote" | "invoice",
    actor: ActorContext,
  ): Promise<ImportResult> {
    const odooModel = entity === "quote" ? "sale.order.line" : "account.move.line";
    const parentField = entity === "quote" ? "order_id" : "move_id";
    const qtyField = entity === "quote" ? "product_uom_qty" : "quantity";
    const result: ImportResult = {
      entity: `${entity} lines`,
      odooModel,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    const parents = await this.importedByOdooId(entity, actor);
    if (parents.size === 0) return result;

    const parentIds = [...parents.keys()];
    // Invoice lines include section/note rows and tax/receivable lines; keep
    // only real product lines.
    const domain: unknown[][] =
      entity === "quote"
        ? [[parentField, "in", parentIds]]
        : [
            [parentField, "in", parentIds],
            ["display_type", "=", false],
            ["exclude_from_invoice_tab", "=", false],
          ];

    const linesByParent = new Map<number, Record<string, unknown>[]>();
    let offset = 0;
    for (;;) {
      let rows: Record<string, unknown>[];
      try {
        rows = await this.searchRead(
          odooModel,
          domain,
          [parentField, "name", qtyField, "price_unit", "price_subtotal"],
          200,
          offset,
        );
      } catch (err) {
        // Older Odoo versions lack exclude_from_invoice_tab — retry simpler
        if (entity === "invoice" && offset === 0) {
          rows = await this.searchRead(
            odooModel,
            [[parentField, "in", parentIds], ["display_type", "=", false]],
            [parentField, "name", qtyField, "price_unit", "price_subtotal"],
            200,
            offset,
          );
        } else {
          result.errors.push(`Reading ${odooModel}: ${(err as Error).message}`);
          break;
        }
      }
      if (rows.length === 0) break;
      for (const row of rows) {
        const parentId = Array.isArray(row[parentField])
          ? Number((row[parentField] as unknown[])[0])
          : Number(row[parentField]);
        if (!Number.isFinite(parentId)) continue;
        const quantity = Number(row[qtyField] ?? 1);
        const unitPrice = Number(row.price_unit ?? 0);
        const list = linesByParent.get(parentId) ?? [];
        list.push({
          description: row.name === false ? "" : String(row.name ?? ""),
          quantity,
          unitPrice,
          amount: Number(row.price_subtotal ?? quantity * unitPrice),
        });
        linesByParent.set(parentId, list);
      }
      if (rows.length < 200) break;
      offset += 200;
    }

    for (const [odooId, lines] of linesByParent) {
      const parent = parents.get(odooId);
      if (!parent) continue;
      try {
        await entityService.update(entity, String(parent.id), { lines }, actor);
        result.updated++;
      } catch (err) {
        result.skipped++;
        result.errors.push(`${entity} ${odooId}: ${(err as Error).message}`);
      }
    }
    return result;
  }

  /**
   * Import Odoo chatter (mail.message) as Meridian comments on the records
   * those messages belong to.
   */
  async importChatter(actor: ActorContext, entities: string[]): Promise<ImportResult> {
    const result: ImportResult = {
      entity: "chatter",
      odooModel: "mail.message",
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    // Which Odoo model each imported entity came from, so res_id can be resolved
    const modelForEntity = new Map<string, string>();
    for (const mapping of ODOO_MODEL_MAPPINGS) {
      if (entities.includes(mapping.meridianEntity) && !modelForEntity.has(mapping.meridianEntity)) {
        modelForEntity.set(mapping.meridianEntity, mapping.odooModel);
      }
    }

    for (const [entity, odooModel] of modelForEntity) {
      const parents = await this.importedByOdooId(entity, actor);
      if (parents.size === 0) continue;

      let offset = 0;
      for (;;) {
        let rows: Record<string, unknown>[];
        try {
          rows = await this.searchRead(
            "mail.message",
            [
              ["model", "=", odooModel],
              ["res_id", "in", [...parents.keys()]],
              ["message_type", "in", ["comment", "email"]],
            ],
            ["res_id", "body", "author_id", "date"],
            200,
            offset,
          );
        } catch (err) {
          result.errors.push(`Reading chatter for ${odooModel}: ${(err as Error).message}`);
          break;
        }
        if (rows.length === 0) break;

        for (const row of rows) {
          const parent = parents.get(Number(row.res_id));
          if (!parent) continue;
          const body = stripHtml(String(row.body ?? ""));
          if (!body) {
            result.skipped++;
            continue;
          }
          try {
            await entityService.upsertByExternalId(
              "comment",
              `odoo_msg_${row.id}`,
              "odoo",
              {
                relatedEntity: entity,
                relatedId: String(parent.id),
                body,
                authorName: Array.isArray(row.author_id) ? String(row.author_id[1]) : "Odoo",
              },
              actor,
            );
            result.created++;
          } catch (err) {
            result.skipped++;
            result.errors.push(`message ${row.id}: ${(err as Error).message}`);
          }
        }
        if (rows.length < 200) break;
        offset += 200;
      }
    }
    return result;
  }

  /** Replace imported Odoo IDs on relation fields with the UUID of the
   * already-imported Meridian record (matched by external_id). */
  private async resolveRelations(
    data: Record<string, unknown>,
    mapping: ModelMapping,
    actor: ActorContext,
  ): Promise<void> {
    for (const fm of mapping.fields) {
      if (!fm.relation || data[fm.meridianField] === undefined) continue;
      const result = await entityService.list(
        fm.relation,
        {
          tenantId: actor.tenantId,
          filters: { externalId: `odoo_${data[fm.meridianField]}`, sourceSystem: "odoo" },
          pageSize: 1,
        },
        actor,
      );
      const match = result.data[0];
      if (match) data[fm.meridianField] = match.id;
      else delete data[fm.meridianField];
    }
  }

  private mapRecord(
    record: Record<string, unknown>,
    mapping: ModelMapping,
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    const target = entityRegistry.get(mapping.meridianEntity);

    for (const fieldMapping of mapping.fields) {
      const rawValue = record[fieldMapping.odooField];
      if (rawValue === undefined) continue;
      // Odoo uses `false` both as "empty" (for text/relation fields) and as a
      // genuine boolean. Dropping it wholesale imported archived records as
      // active — keep it when the target field really is a boolean.
      if (rawValue === false && target?.fields[fieldMapping.meridianField]?.type !== "boolean") {
        continue;
      }
      data[fieldMapping.meridianField] = fieldMapping.transform
        ? fieldMapping.transform(rawValue)
        : rawValue;
    }

    return data;
  }

  getAvailableMappings(): ModelMapping[] {
    return ODOO_MODEL_MAPPINGS;
  }
}

/** Odoo chatter bodies are HTML; comments are plain text. */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
