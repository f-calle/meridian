import xmlrpc from "xmlrpc";
import type { ActorContext } from "@meridian/core";
import { entityService } from "@meridian/core";
import type { OdooConfig, ModelMapping, ImportResult, MigrationReport } from "./index.js";
import { ODOO_MODEL_MAPPINGS } from "./index.js";

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

  async fetchModelCount(model: string): Promise<number> {
    if (!this.uid) await this.connect();

    const object = xmlrpc.createSecureClient({ url: `${this.config.url}/xmlrpc/2/object` });
    return new Promise((resolve, reject) => {
      object.methodCall(
        "execute_kw",
        [this.config.database, this.uid, this.config.password, model, "search_count", [[]]],
        (err, result) => {
          if (err) reject(err);
          else resolve(Number(result));
        },
      );
    });
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
    const result: ImportResult = {
      entity: mapping.meridianEntity,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    const odooFields = mapping.fields.map((f) => f.odooField);
    const uniqueFields = [...new Set(odooFields), "id"];
    const domain = mapping.filter
      ? Object.entries(mapping.filter).map(([k, v]) => [k, "=", v] as unknown[])
      : [];

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

          await entityService.upsertByExternalId(
            mapping.meridianEntity,
            externalId,
            "odoo",
            data,
            actor,
          );
          result.created++;
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

    report.status = "completed";
    report.completedAt = new Date();
    return report;
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

    for (const fieldMapping of mapping.fields) {
      const rawValue = record[fieldMapping.odooField];
      if (rawValue === undefined || rawValue === false) continue;
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
