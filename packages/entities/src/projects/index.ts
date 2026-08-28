import { defineEntity, field } from "@meridian/core";


export const ProjectEntity = defineEntity({
  name: "project",
  sensitivity: "delivery",
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
  lifecycle: {
    onCreate: ["audit.log"],
    onUpdate: ["audit.log"],
  },
});

export const TaskEntity = defineEntity({
  name: "task",
  sensitivity: "delivery",
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
  lifecycle: {
    onCreate: ["audit.log"],
    onUpdate: ["audit.log"],
  },
});

export const TimeEntryEntity = defineEntity({
  name: "time_entry",
  sensitivity: "delivery",
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
  lifecycle: {
    onCreate: ["audit.log"],
    onUpdate: ["audit.log"],
  },
});

export const MilestoneEntity = defineEntity({
  name: "milestone",
  sensitivity: "delivery",
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
  lifecycle: {
    onCreate: ["audit.log"],
    onUpdate: ["audit.log"],
  },
});

export const projectEntities = [ProjectEntity, TaskEntity, TimeEntryEntity, MilestoneEntity];
