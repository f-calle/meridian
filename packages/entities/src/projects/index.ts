import { defineEntity, field } from "@meridian/core";

const adminPerms = { create: true, read: true, update: true, delete: true };
const memberPerms = { create: true, read: true, update: true, delete: false };
const agentPerms = { create: true, read: true, update: true, delete: false };

export const ProjectEntity = defineEntity({
  name: "project",
  label: "Project",
  pluralLabel: "Projects",
  externalId: true,
  fields: {
    name: field.string({ required: true, label: "Project Name" }),
    description: field.text({ label: "Description" }),
    status: field.select(["planning", "active", "on_hold", "completed", "cancelled"], {
      required: true,
      label: "Status",
      default: "planning",
    }),
    companyId: field.relation("company", { label: "Client" }),
    budget: field.currency({ label: "Budget" }),
    deadline: field.date({ label: "Deadline" }),
    managerId: field.string({ label: "Project Manager" }),
  },
  permissions: {
    admin: adminPerms,
    sales: memberPerms,
    member: memberPerms,
    agent: agentPerms,
  },
  lifecycle: {
    onCreate: ["audit.log"],
    onUpdate: ["audit.log"],
  },
});

export const TaskEntity = defineEntity({
  name: "task",
  label: "Task",
  pluralLabel: "Tasks",
  externalId: true,
  fields: {
    title: field.string({ required: true, label: "Task Title" }),
    description: field.text({ label: "Description" }),
    projectId: field.relation("project", { required: true, label: "Project" }),
    status: field.select(["todo", "in_progress", "review", "done"], {
      required: true,
      label: "Status",
      default: "todo",
    }),
    priority: field.select(["low", "medium", "high", "urgent"], {
      label: "Priority",
      default: "medium",
    }),
    assigneeId: field.string({ label: "Assignee" }),
    dueDate: field.date({ label: "Due Date" }),
    estimatedHours: field.number({ label: "Estimated Hours" }),
  },
  permissions: {
    admin: adminPerms,
    sales: memberPerms,
    member: memberPerms,
    agent: agentPerms,
  },
  lifecycle: {
    onCreate: ["audit.log"],
    onUpdate: ["audit.log"],
  },
});

export const TimeEntryEntity = defineEntity({
  name: "time_entry",
  label: "Time Entry",
  pluralLabel: "Time Entries",
  externalId: true,
  fields: {
    taskId: field.relation("task", { required: true, label: "Task" }),
    projectId: field.relation("project", { label: "Project" }),
    userId: field.string({ required: true, label: "User" }),
    hours: field.number({ required: true, label: "Hours" }),
    date: field.date({ required: true, label: "Date" }),
    description: field.text({ label: "Description" }),
    billable: field.boolean({ label: "Billable", default: true }),
  },
  permissions: {
    admin: adminPerms,
    sales: memberPerms,
    member: memberPerms,
    agent: agentPerms,
  },
  lifecycle: {
    onCreate: ["audit.log"],
    onUpdate: ["audit.log"],
  },
});

export const MilestoneEntity = defineEntity({
  name: "milestone",
  label: "Milestone",
  pluralLabel: "Milestones",
  fields: {
    title: field.string({ required: true, label: "Milestone Title" }),
    projectId: field.relation("project", { required: true, label: "Project" }),
    dueDate: field.date({ label: "Due Date" }),
    status: field.select(["pending", "in_progress", "completed", "missed"], {
      label: "Status",
      default: "pending",
    }),
    description: field.text({ label: "Description" }),
  },
  permissions: {
    admin: adminPerms,
    sales: memberPerms,
    member: memberPerms,
    agent: agentPerms,
  },
  lifecycle: {
    onCreate: ["audit.log"],
    onUpdate: ["audit.log"],
  },
});

export const projectEntities = [ProjectEntity, TaskEntity, TimeEntryEntity, MilestoneEntity];
