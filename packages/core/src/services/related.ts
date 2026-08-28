import type { ActorContext, EntityDefinition } from "../types.js";
import { entityRegistry } from "../entity/registry.js";
import { entityService } from "./entity-service.js";
import { inboundRelations } from "./references.js";
import { isPermissionError } from "../acl/permissions.js";

/**
 * Everything that points at a record, plus what it points at.
 *
 * A company detail page used to show a company's own columns and nothing else,
 * which is the least interesting thing about it — what you actually want is its
 * people, its deals, what it owes you. The relation graph needed to answer that
 * already exists: it is the same graph that decides whether a delete is safe.
 */

export interface RelatedGroup {
  /** Entity holding the pointer, e.g. "contact". */
  entity: string;
  label: string;
  /** The relation field on that entity, e.g. "companyId". */
  field: string;
  records: Record<string, unknown>[];
  total: number;
  /** Sum of the group's money field, when it has one. */
  totalValue?: number;
}

export interface RelatedRecords {
  groups: RelatedGroup[];
  /** Rolled-up figures worth showing above the groups. */
  rollups: { label: string; value: number; format: "currency" | "number" }[];
}

/** The money field to roll up for an entity, if it has an obvious one. */
const VALUE_FIELD: Record<string, string> = {
  deal: "value",
  quote: "total",
  invoice: "total",
  project: "budget",
};

/** Groups worth loading first — the ones a person looks for. */
const GROUP_ORDER = ["deal", "quote", "invoice", "contact", "project", "task", "activity"];

function labelFor(entity: EntityDefinition | undefined, name: string): string {
  if (!entity) return name;
  return entity.pluralLabel ?? `${entity.label}s`;
}

/**
 * Load the records related to one record.
 *
 * Comments and audit entries are excluded: the detail page already shows those
 * as a timeline, and repeating them as a "related records" table would be noise.
 */
export async function collectRelated(
  entityName: string,
  recordId: string,
  actor: ActorContext,
  options: { perGroup?: number } = {},
): Promise<RelatedRecords> {
  const perGroup = options.perGroup ?? 5;
  const inbound = inboundRelations(entityName).filter((r) => r.entity !== "comment");

  const ordered = [...inbound].sort((a, b) => {
    const ai = GROUP_ORDER.indexOf(a.entity);
    const bi = GROUP_ORDER.indexOf(b.entity);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const groups: RelatedGroup[] = [];
  const rollups: RelatedRecords["rollups"] = [];

  for (const { entity, field } of ordered) {
    const definition = entityRegistry.get(entity);
    try {
      const result = await entityService.list(
        entity,
        {
          tenantId: actor.tenantId,
          filters: { [field]: recordId },
          pageSize: perGroup,
          sortBy: "createdAt",
          sortOrder: "desc",
        },
        actor,
      );
      if (result.total === 0) continue;

      const group: RelatedGroup = {
        entity,
        label: labelFor(definition, entity),
        field,
        records: result.data,
        total: result.total,
      };

      // Sum across every match, not just the page being shown — a company with
      // 40 deals should report all of them, not the five that fit.
      const valueField = VALUE_FIELD[entity];
      if (valueField && definition?.fields[valueField]) {
        const [agg] = await entityService.aggregate(
          entity,
          { metric: "sum", metricField: valueField, filters: { [field]: recordId } },
          actor,
        );
        group.totalValue = agg?.value ?? 0;
      }

      groups.push(group);
    } catch (err) {
      // A role without read access on one entity loses that group, not the page.
      if (!isPermissionError(err)) throw err;
    }
  }

  const dealValue = groups.find((g) => g.entity === "deal")?.totalValue;
  if (dealValue !== undefined) {
    rollups.push({ label: "Deal value", value: dealValue, format: "currency" });
  }

  const invoices = groups.find((g) => g.entity === "invoice");
  if (invoices) {
    // What they owe, not what they have ever been billed.
    const [outstanding] = await entityService.aggregate(
      "invoice",
      {
        metric: "sum",
        metricField: "total",
        filters: {
          [invoices.field]: recordId,
          status: { op: "nin", value: ["paid", "cancelled"] },
        },
      },
      actor,
    );
    rollups.push({ label: "Outstanding", value: outstanding?.value ?? 0, format: "currency" });
  }

  const contacts = groups.find((g) => g.entity === "contact");
  if (contacts) rollups.push({ label: "People", value: contacts.total, format: "number" });

  return { groups, rollups };
}
