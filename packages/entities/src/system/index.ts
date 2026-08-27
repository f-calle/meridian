import { defineEntity, field } from "@meridian/core";

const adminOnly = { create: true, read: true, update: true, delete: true };
const readOnly = { create: false, read: true, update: false, delete: false };

/**
 * Automation rules: "when <entity> is <event> and <conditions> hold, run <actions>".
 *
 * conditions: [{ field, op, value }]  ops: eq, neq, gt, gte, lt, lte, contains, is_set, not_set
 * actions:    [{ type: "set_field", field, value }]
 *             [{ type: "create_record", entity, data }]   data values support {{field}} templates
 *             [{ type: "webhook", url }]
 */
export const AutomationEntity = defineEntity({
  name: "automation",
  label: "Automation",
  pluralLabel: "Automations",
  fields: {
    name: field.string({ required: true, label: "Name" }),
    entity: field.string({ required: true, label: "Trigger Entity" }),
    event: field.select(["created", "updated", "deleted"], {
      required: true,
      label: "Trigger Event",
      default: "updated",
    }),
    conditions: field.json({ label: "Conditions", default: [] }),
    actions: field.json({ label: "Actions", default: [] }),
    enabled: field.boolean({ label: "Enabled", default: true }),
  },
  permissions: {
    admin: adminOnly,
    sales: readOnly,
    member: readOnly,
    agent: readOnly,
  },
});

export const systemEntities = [AutomationEntity];
