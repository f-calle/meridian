import { defineEntity, field } from "@meridian/core";

const adminPerms = { create: true, read: true, update: true, delete: true };
const salesPerms = { create: true, read: true, update: true, delete: false };
const memberPerms = { create: false, read: true, update: false, delete: false };

export const ContactEntity = defineEntity({
  name: "contact",
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
  permissions: {
    admin: adminPerms,
    sales: salesPerms,
    member: memberPerms,
    agent: salesPerms,
  },
  lifecycle: {
    onCreate: ["audit.log"],
    onUpdate: ["audit.log"],
  },
});

export const CompanyEntity = defineEntity({
  name: "company",
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
  permissions: {
    admin: adminPerms,
    sales: salesPerms,
    member: memberPerms,
    agent: salesPerms,
  },
  lifecycle: {
    onCreate: ["audit.log"],
    onUpdate: ["audit.log"],
  },
});

export const PipelineEntity = defineEntity({
  name: "pipeline",
  label: "Pipeline",
  pluralLabel: "Pipelines",
  fields: {
    name: field.string({ required: true, label: "Pipeline Name" }),
    stages: field.json({ label: "Stages", default: ["lead", "qualified", "proposal", "won", "lost"] }),
    isDefault: field.boolean({ label: "Default Pipeline", default: false }),
  },
  permissions: {
    admin: adminPerms,
    sales: { ...salesPerms, delete: false },
    member: memberPerms,
    agent: memberPerms,
  },
});

export const DealEntity = defineEntity({
  name: "deal",
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
    notes: field.text({ label: "Notes" }),
  },
  permissions: {
    admin: adminPerms,
    sales: salesPerms,
    member: memberPerms,
    agent: salesPerms,
  },
  lifecycle: {
    onCreate: ["audit.log"],
    onUpdate: ["audit.log"],
  },
});

export const ActivityEntity = defineEntity({
  name: "activity",
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
    relatedEntity: field.select(["deal", "contact", "company", "project"], { label: "Related To" }),
    relatedId: field.string({ label: "Related Record ID" }),
    dueDate: field.datetime({ label: "Due Date" }),
    completed: field.boolean({ label: "Completed", default: false }),
    assignedTo: field.string({ label: "Assigned To" }),
  },
  permissions: {
    admin: adminPerms,
    sales: salesPerms,
    member: { ...memberPerms, create: true, update: true },
    agent: salesPerms,
  },
  lifecycle: {
    onCreate: ["audit.log"],
    onUpdate: ["audit.log"],
  },
});

export const crmEntities = [ContactEntity, CompanyEntity, PipelineEntity, DealEntity, ActivityEntity];
