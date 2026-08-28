// GENERATED FILE — do not edit by hand.
// Produced from the entity registry by `pnpm db:generate`.
// Changing an entity? Run `pnpm db:generate` and commit both this file and
// the migration it produces under packages/core/drizzle/.

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const activityTable = pgTable(
  "activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    externalId: text("external_id"),
    sourceSystem: text("source_system"),
    type: text("type"),
    subject: text("subject"),
    notes: text("notes"),
    relatedEntity: text("related_entity"),
    relatedId: text("related_id"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    completed: boolean("completed"),
    assignedTo: text("assigned_to"),
  },
  (t) => [
    index("activity_tenant_idx").on(t.tenantId),
    uniqueIndex("activity_external_idx")
      .on(t.tenantId, t.externalId, t.sourceSystem)
      .where(sql`external_id IS NOT NULL`),
  ],
);

export const automationTable = pgTable(
  "automation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    name: text("name"),
    entity: text("entity"),
    event: text("event"),
    conditions: jsonb("conditions"),
    actions: jsonb("actions"),
    enabled: boolean("enabled"),
  },
  (t) => [
    index("automation_tenant_idx").on(t.tenantId),
  ],
);

export const commentTable = pgTable(
  "comment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    externalId: text("external_id"),
    sourceSystem: text("source_system"),
    relatedEntity: text("related_entity"),
    relatedId: text("related_id"),
    body: text("body"),
    authorName: text("author_name"),
    authorId: text("author_id"),
  },
  (t) => [
    index("comment_tenant_idx").on(t.tenantId),
    uniqueIndex("comment_external_idx")
      .on(t.tenantId, t.externalId, t.sourceSystem)
      .where(sql`external_id IS NOT NULL`),
  ],
);

export const companyTable = pgTable(
  "company",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    externalId: text("external_id"),
    sourceSystem: text("source_system"),
    name: text("name"),
    industry: text("industry"),
    size: text("size"),
    website: text("website"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
  },
  (t) => [
    index("company_tenant_idx").on(t.tenantId),
    uniqueIndex("company_external_idx")
      .on(t.tenantId, t.externalId, t.sourceSystem)
      .where(sql`external_id IS NOT NULL`),
  ],
);

export const contactTable = pgTable(
  "contact",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    externalId: text("external_id"),
    sourceSystem: text("source_system"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    title: text("title"),
    companyId: text("company_id"),
    tags: jsonb("tags"),
    notes: text("notes"),
  },
  (t) => [
    index("contact_tenant_idx").on(t.tenantId),
    uniqueIndex("contact_external_idx")
      .on(t.tenantId, t.externalId, t.sourceSystem)
      .where(sql`external_id IS NOT NULL`),
  ],
);

export const dealTable = pgTable(
  "deal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    externalId: text("external_id"),
    sourceSystem: text("source_system"),
    title: text("title"),
    value: numeric("value", { precision: 15, scale: 2 }),
    stage: text("stage"),
    probability: integer("probability"),
    contactId: text("contact_id"),
    companyId: text("company_id"),
    pipelineId: text("pipeline_id"),
    assignedTo: text("assigned_to"),
    expectedClose: timestamp("expected_close", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    notes: text("notes"),
  },
  (t) => [
    index("deal_tenant_idx").on(t.tenantId),
    uniqueIndex("deal_external_idx")
      .on(t.tenantId, t.externalId, t.sourceSystem)
      .where(sql`external_id IS NOT NULL`),
  ],
);

export const invoiceTable = pgTable(
  "invoice",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    externalId: text("external_id"),
    sourceSystem: text("source_system"),
    number: text("number"),
    status: text("status"),
    companyId: text("company_id"),
    contactId: text("contact_id"),
    issueDate: timestamp("issue_date", { withTimezone: true }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    lines: jsonb("lines"),
    subtotal: numeric("subtotal", { precision: 15, scale: 2 }),
    tax: numeric("tax", { precision: 15, scale: 2 }),
    total: numeric("total", { precision: 15, scale: 2 }),
    notes: text("notes"),
  },
  (t) => [
    index("invoice_tenant_idx").on(t.tenantId),
    uniqueIndex("invoice_external_idx")
      .on(t.tenantId, t.externalId, t.sourceSystem)
      .where(sql`external_id IS NOT NULL`),
  ],
);

export const milestoneTable = pgTable(
  "milestone",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    title: text("title"),
    projectId: text("project_id"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    status: text("status"),
    description: text("description"),
  },
  (t) => [
    index("milestone_tenant_idx").on(t.tenantId),
  ],
);

export const pipelineTable = pgTable(
  "pipeline",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    name: text("name"),
    stages: jsonb("stages"),
    isDefault: boolean("is_default"),
  },
  (t) => [
    index("pipeline_tenant_idx").on(t.tenantId),
  ],
);

export const productTable = pgTable(
  "product",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    externalId: text("external_id"),
    sourceSystem: text("source_system"),
    name: text("name"),
    sku: text("sku"),
    price: numeric("price", { precision: 15, scale: 2 }),
    cost: numeric("cost", { precision: 15, scale: 2 }),
    unit: text("unit"),
    active: boolean("active"),
    description: text("description"),
  },
  (t) => [
    index("product_tenant_idx").on(t.tenantId),
    uniqueIndex("product_external_idx")
      .on(t.tenantId, t.externalId, t.sourceSystem)
      .where(sql`external_id IS NOT NULL`),
  ],
);

export const projectTable = pgTable(
  "project",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    externalId: text("external_id"),
    sourceSystem: text("source_system"),
    name: text("name"),
    description: text("description"),
    status: text("status"),
    companyId: text("company_id"),
    budget: numeric("budget", { precision: 15, scale: 2 }),
    deadline: timestamp("deadline", { withTimezone: true }),
    managerId: text("manager_id"),
  },
  (t) => [
    index("project_tenant_idx").on(t.tenantId),
    uniqueIndex("project_external_idx")
      .on(t.tenantId, t.externalId, t.sourceSystem)
      .where(sql`external_id IS NOT NULL`),
  ],
);

export const quoteTable = pgTable(
  "quote",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    externalId: text("external_id"),
    sourceSystem: text("source_system"),
    number: text("number"),
    status: text("status"),
    companyId: text("company_id"),
    contactId: text("contact_id"),
    dealId: text("deal_id"),
    issueDate: timestamp("issue_date", { withTimezone: true }),
    expiryDate: timestamp("expiry_date", { withTimezone: true }),
    lines: jsonb("lines"),
    subtotal: numeric("subtotal", { precision: 15, scale: 2 }),
    tax: numeric("tax", { precision: 15, scale: 2 }),
    total: numeric("total", { precision: 15, scale: 2 }),
    notes: text("notes"),
  },
  (t) => [
    index("quote_tenant_idx").on(t.tenantId),
    uniqueIndex("quote_external_idx")
      .on(t.tenantId, t.externalId, t.sourceSystem)
      .where(sql`external_id IS NOT NULL`),
  ],
);

export const taskTable = pgTable(
  "task",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    externalId: text("external_id"),
    sourceSystem: text("source_system"),
    title: text("title"),
    description: text("description"),
    projectId: text("project_id"),
    status: text("status"),
    priority: text("priority"),
    assigneeId: text("assignee_id"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    estimatedHours: integer("estimated_hours"),
  },
  (t) => [
    index("task_tenant_idx").on(t.tenantId),
    uniqueIndex("task_external_idx")
      .on(t.tenantId, t.externalId, t.sourceSystem)
      .where(sql`external_id IS NOT NULL`),
  ],
);

export const timeEntryTable = pgTable(
  "time_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    externalId: text("external_id"),
    sourceSystem: text("source_system"),
    taskId: text("task_id"),
    projectId: text("project_id"),
    userId: text("user_id"),
    hours: integer("hours"),
    date: timestamp("date", { withTimezone: true }),
    description: text("description"),
    billable: boolean("billable"),
  },
  (t) => [
    index("time_entry_tenant_idx").on(t.tenantId),
    uniqueIndex("time_entry_external_idx")
      .on(t.tenantId, t.externalId, t.sourceSystem)
      .where(sql`external_id IS NOT NULL`),
  ],
);
