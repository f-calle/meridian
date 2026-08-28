import { defineEntity, field } from "@meridian/core";


export const ContactEntity = defineEntity({
  name: "contact",
  sensitivity: "crm",
  label: "Contact",
  pluralLabel: "Contacts",
  externalId: true,
  fields: {
    firstName: field.string({ required: true, label: "First Name" }),
    lastName: field.string({ required: true, label: "Last Name" }),
    email: field.email({ label: "Email" }),
    phone: field.phone({ label: "Phone" }),
    title: field.string({ label: "Job Title" }),
    companyId: field.relation("company", { label: "Company" }),
    tags: field.multiselect(["lead", "customer", "partner", "vendor"], { label: "Tags" }),
    notes: field.text({ label: "Notes" }),
  },
  lifecycle: {
    onCreate: ["audit.log"],
    onUpdate: ["audit.log"],
  },
});

export const CompanyEntity = defineEntity({
  name: "company",
  sensitivity: "crm",
  label: "Company",
  pluralLabel: "Companies",
  externalId: true,
  fields: {
    name: field.string({ required: true, label: "Company Name" }),
    industry: field.select(
      ["technology", "finance", "healthcare", "retail", "manufacturing", "other"],
      { label: "Industry" },
    ),
    size: field.select(["1-10", "11-50", "51-200", "201-1000", "1000+"], { label: "Company Size" }),
    website: field.string({ label: "Website" }),
    email: field.email({ label: "Email" }),
    phone: field.phone({ label: "Phone" }),
    address: field.text({ label: "Address" }),
  },
  lifecycle: {
    onCreate: ["audit.log"],
    onUpdate: ["audit.log"],
  },
});

export const PipelineEntity = defineEntity({
  name: "pipeline",
  // Stage definitions are configuration, not customer data — an ops job, not a rep's.
  sensitivity: "config",
  label: "Pipeline",
  pluralLabel: "Pipelines",
  fields: {
    name: field.string({ required: true, label: "Pipeline Name" }),
    stages: field.json({ label: "Stages", default: ["lead", "qualified", "proposal", "won", "lost"] }),
    isDefault: field.boolean({ label: "Default Pipeline", default: false }),
  },
});

export const DealEntity = defineEntity({
  name: "deal",
  sensitivity: "crm",
  label: "Deal",
  pluralLabel: "Deals",
  externalId: true,
  fields: {
    title: field.string({ required: true, label: "Deal Title" }),
    value: field.currency({ required: true, label: "Value", default: 0 }),
    stage: field.select(["lead", "qualified", "proposal", "won", "lost"], {
      required: true,
      label: "Stage",
      default: "lead",
    }),
    probability: field.number({ label: "Win Probability (%)", default: 0 }),
    contactId: field.relation("contact", { label: "Contact" }),
    companyId: field.relation("company", { label: "Company" }),
    pipelineId: field.relation("pipeline", { label: "Pipeline" }),
    assignedTo: field.string({ label: "Assigned To" }),
    expectedClose: field.date({ label: "Expected Close Date" }),
    /**
     * When the deal actually closed, won or lost.
     *
     * Stage alone is a snapshot: it says where every deal sits right now and
     * nothing about when it got there. Without this there is no bookings-by-
     * month, no win-rate trend, no sales-cycle length — every report that has a
     * time axis. `updatedAt` is not a substitute; any later edit moves it.
     *
     * Derived, not entered: see `derive` below.
     */
    closedAt: field.date({ label: "Closed Date" }),
    notes: field.text({ label: "Notes" }),
  },
  /**
   * Stamp closedAt when the deal reaches a closed stage, clear it if the deal
   * is reopened. Nobody types this field; the whole point is that it records
   * what happened rather than what someone remembered to record.
   */
  derive: (incoming, previous) => {
    // An explicit value always wins. An Odoo import carries the real historical
    // close date, and stamping today over it would silently rewrite years of
    // history into one afternoon — for a product whose pitch is painless
    // migration, that is the worst possible place to be clever.
    if (incoming.closedAt !== undefined) return undefined;

    const stage = (incoming.stage ?? previous?.stage) as string | undefined;
    if (!stage) return undefined;
    const isClosed = stage === "won" || stage === "lost";
    const wasStamped = Boolean(previous?.closedAt);

    // Already stamped and still closed: leave it. Re-stamping on every later
    // edit would move the close date every time someone fixed a typo.
    if (isClosed && !wasStamped) return { closedAt: new Date().toISOString().slice(0, 10) };
    if (!isClosed && wasStamped) return { closedAt: null };
    return undefined;
  },
  lifecycle: {
    onCreate: ["audit.log"],
    onUpdate: ["audit.log"],
  },
});

export const ActivityEntity = defineEntity({
  name: "activity",
  // A logged call or email is work recorded against a record, not master data.
  sensitivity: "collaboration",
  label: "Activity",
  pluralLabel: "Activities",
  externalId: true,
  fields: {
    type: field.select(["call", "email", "meeting", "note", "task"], {
      required: true,
      label: "Activity Type",
    }),
    subject: field.string({ required: true, label: "Subject" }),
    notes: field.text({ label: "Notes" }),
    relatedEntity: field.select(
      ["deal", "contact", "company", "project", "task", "quote", "invoice"],
      { label: "Related To" },
    ),
    relatedId: field.string({ label: "Related Record ID" }),
    dueDate: field.datetime({ label: "Due Date" }),
    completed: field.boolean({ label: "Completed", default: false }),
    assignedTo: field.string({ label: "Assigned To" }),
  },
  lifecycle: {
    onCreate: ["audit.log"],
    onUpdate: ["audit.log"],
  },
});

export const crmEntities = [ContactEntity, CompanyEntity, PipelineEntity, DealEntity, ActivityEntity];
