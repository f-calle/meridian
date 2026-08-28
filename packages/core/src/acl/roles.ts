import type { PermissionMatrix } from "../types.js";

/**
 * Who can do what, defined once.
 *
 * Permissions used to live in a matrix on every entity, and the mechanism had
 * already failed at its only job: `member` was read-only in crm/index.ts and
 * commerce/index.ts but create-read-update in projects/index.ts, because each
 * file declared its own local const. The same role name meant two different
 * things depending on which file an entity happened to live in, and nobody
 * could state what `member` could do without reading four files.
 *
 * The fix is not "pick one" — it is to notice that the difference was
 * accidental rather than principled. A member genuinely should read customer
 * records and genuinely should edit the project work assigned to them. What was
 * missing was a way to say that once. So roles are defined against what a kind
 * of data IS, not against each table:
 *
 *   crm            customers and the pipeline
 *   finance        money: products, quotes, invoices
 *   delivery       the work: projects, tasks, time, milestones
 *   collaboration  comments and notes on anything
 *   config         automations and system behaviour
 *
 * Adding a role is now one edit here instead of fourteen across four files —
 * where missing one produces a 403 on exactly one entity, found in production,
 * and on dashboards an invisible empty section rather than an error.
 */

export type EntityClass = "crm" | "finance" | "delivery" | "collaboration" | "config";

/** Capabilities beyond record CRUD — things routes gate on, not entities. */
export type Capability =
  | "manage:users"
  | "manage:billing"
  | "manage:config"
  | "manage:import"
  | "manage:branding";

export interface RoleDefinition {
  label: string;
  /** One line on the job this role does, shown when assigning it. */
  description: string;
  access: Record<EntityClass, PermissionMatrix>;
  capabilities: Capability[];
  /** Assignable through the team UI. `agent` is issued with a key, not assigned. */
  assignable: boolean;
}

const NONE: PermissionMatrix = { create: false, read: false, update: false, delete: false };
const READ: PermissionMatrix = { create: false, read: true, update: false, delete: false };
/** Create, read and update, but not delete — the common non-admin shape. */
const WRITE: PermissionMatrix = { create: true, read: true, update: true, delete: false };
const FULL: PermissionMatrix = { create: true, read: true, update: true, delete: true };

const ALL_CAPABILITIES: Capability[] = [
  "manage:users",
  "manage:billing",
  "manage:config",
  "manage:import",
  "manage:branding",
];

export const ROLES = {
  /**
   * The person who owns the subscription and the legal entity.
   *
   * Exists to be the tier above admin rather than a wider set of CRUD: an owner
   * cannot be demoted or removed by an admin. Without it, any one admin can
   * strip every other administrator, which is a lockout with no recovery path.
   */
  owner: {
    label: "Owner",
    description: "Full access, plus billing. Cannot be removed or demoted by an admin.",
    access: { crm: FULL, finance: FULL, delivery: FULL, collaboration: FULL, config: FULL },
    capabilities: ALL_CAPABILITIES,
    assignable: true,
  },

  /** Office manager, ops lead, whoever configures the system. */
  admin: {
    label: "Admin",
    description: "Full access to records and settings. Can invite and remove people.",
    access: { crm: FULL, finance: FULL, delivery: FULL, collaboration: FULL, config: FULL },
    capabilities: ["manage:users", "manage:config", "manage:import", "manage:branding"],
    assignable: true,
  },

  /**
   * Bookkeeper, controller, external accountant.
   *
   * The point of separating this from `sales` is segregation of duties: the
   * person who closes the deal should not also be the person who raises the
   * invoice and marks it paid.
   */
  finance: {
    label: "Finance",
    description: "Owns quotes, invoices and products. Reads the rest.",
    access: { crm: READ, finance: FULL, delivery: READ, collaboration: WRITE, config: READ },
    capabilities: ["manage:import"],
    assignable: true,
  },

  /** A rep. Owns the customer relationship and the pipeline. */
  sales: {
    label: "Sales",
    description: "Owns contacts, companies, deals and quotes. Reads invoices and the catalogue.",
    access: { crm: WRITE, finance: READ, delivery: WRITE, collaboration: WRITE, config: READ },
    capabilities: [],
    assignable: true,
  },

  /**
   * The default employee.
   *
   * Reads customers because they need to know who they are working for, and
   * edits delivery because that is their actual work. That is exactly what the
   * two old definitions of `member` did between them — said once, deliberately,
   * instead of falling out of file layout.
   */
  member: {
    label: "Member",
    description: "Does the work: projects, tasks and time. Reads customers and documents.",
    access: { crm: READ, finance: READ, delivery: WRITE, collaboration: WRITE, config: READ },
    capabilities: [],
    assignable: true,
  },

  /**
   * Genuine read-only, which was previously unrepresentable — the closest role,
   * `member`, could create records. Justified by real people: an accountant
   * during close, a board member, a client stakeholder, a new hire in week one,
   * and any reporting connector.
   */
  viewer: {
    label: "Viewer",
    description: "Can see everything, change nothing.",
    access: { crm: READ, finance: READ, delivery: READ, collaboration: READ, config: READ },
    capabilities: [],
    assignable: true,
  },

  /**
   * The AI and API-key actor.
   *
   * Deliberately cannot write money documents. It previously could create and
   * update quotes and invoices, which put an unattended actor in a position to
   * alter what a customer owes with no approval step in between. It also never
   * deletes and never touches config.
   */
  agent: {
    label: "Agent",
    description: "Automations and AI. Reads broadly, drafts work, never touches money or config.",
    access: { crm: WRITE, finance: READ, delivery: WRITE, collaboration: WRITE, config: READ },
    capabilities: [],
    assignable: false,
  },
} as const satisfies Record<string, RoleDefinition>;

export type RoleName = keyof typeof ROLES;

export const ROLE_NAMES = Object.keys(ROLES) as RoleName[];

/** Roles an admin can assign through the team UI. */
export const ASSIGNABLE_ROLES = ROLE_NAMES.filter((name) => ROLES[name].assignable);

export function isRoleName(value: string): value is RoleName {
  return Object.hasOwn(ROLES, value);
}

/**
 * The default access a role has to a class of data.
 *
 * Unknown roles get nothing. An entity whose class is unknown — a plugin that
 * declared none — is treated as config, so a third-party entity is admin-only
 * until someone says otherwise rather than open by default.
 */
export function defaultAccess(role: string, entityClass: EntityClass = "config"): PermissionMatrix {
  if (!isRoleName(role)) return NONE;
  return ROLES[role].access[entityClass] ?? NONE;
}

export function hasCapability(role: string, capability: Capability): boolean {
  return isRoleName(role) && (ROLES[role].capabilities as readonly Capability[]).includes(capability);
}
