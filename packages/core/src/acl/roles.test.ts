import { describe, expect, it } from "vitest";
import { defaultAccess, getEffectivePermissions, hasCapability, ROLES, ROLE_NAMES, ASSIGNABLE_ROLES, isRoleName } from "../index.js";
import type { EntityDefinition, PermissionMatrix } from "../types.js";

const actor = (role: string) => ({ id: "u", type: "user" as const, tenantId: "t", role });
const entity = (name: string, sensitivity: EntityDefinition["sensitivity"], permissions?: EntityDefinition["permissions"]): EntityDefinition =>
  ({ name, label: name, fields: {}, sensitivity, permissions });

const flags = (m: PermissionMatrix) =>
  `${m.create ? "C" : "-"}${m.read ? "R" : "-"}${m.update ? "U" : "-"}${m.delete ? "D" : "-"}`;

describe("role table", () => {
  it("defines every class for every role", () => {
    // A missing class silently resolves to nothing, which on a dashboard shows
    // as an empty section rather than an error — the worst kind of gap.
    for (const role of ROLE_NAMES) {
      for (const cls of ["crm", "finance", "delivery", "collaboration", "config"] as const) {
        expect(ROLES[role].access[cls], `${role}.${cls}`).toBeDefined();
      }
    }
  });

  it("keeps agent out of the assignable list", () => {
    // It is issued with a key, never picked from a dropdown.
    expect(ASSIGNABLE_ROLES).not.toContain("agent");
    expect(ASSIGNABLE_ROLES).toContain("finance");
    expect(ASSIGNABLE_ROLES).toContain("viewer");
  });

  it("denies a role it has never heard of", () => {
    expect(flags(defaultAccess("marketing", "crm"))).toBe("----");
    expect(isRoleName("marketing")).toBe(false);
  });

  it("is not fooled by a role name from Object.prototype", () => {
    for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(flags(defaultAccess(name, "crm")), name).toBe("----");
      expect(isRoleName(name), name).toBe(false);
    }
  });

  it("treats an unclassified entity as config, not as open", () => {
    // A plugin entity that declares nothing must be admin-only by default.
    expect(flags(getEffectivePermissions(entity("plugin_thing", undefined), actor("member")))).toBe("-R--");
    expect(flags(getEffectivePermissions(entity("plugin_thing", undefined), actor("admin")))).toBe("CRUD");
  });
});

describe("segregation of duties", () => {
  it("lets sales write quotes but not invoices", () => {
    // The person who closes the deal must not be the person who raises the
    // invoice and marks it paid. A quote is a proposal; an invoice is money.
    expect(flags(getEffectivePermissions(entity("quote", "crm"), actor("sales")))).toBe("CRU-");
    expect(flags(getEffectivePermissions(entity("invoice", "finance"), actor("sales")))).toBe("-R--");
  });

  it("keeps the unattended agent away from money documents", () => {
    expect(flags(getEffectivePermissions(entity("invoice", "finance"), actor("agent")))).toBe("-R--");
    expect(flags(getEffectivePermissions(entity("product", "finance"), actor("agent")))).toBe("-R--");
  });

  it("gives viewer read and nothing else, anywhere", () => {
    for (const cls of ["crm", "finance", "delivery", "collaboration", "config"] as const) {
      expect(flags(defaultAccess("viewer", cls)), cls).toBe("-R--");
    }
  });

  it("gives finance ownership of money and read of the rest", () => {
    expect(flags(defaultAccess("finance", "finance"))).toBe("CRUD");
    expect(flags(defaultAccess("finance", "crm"))).toBe("-R--");
  });

  it("lets only owner and admin delete", () => {
    for (const role of ROLE_NAMES) {
      const canDeleteCrm = defaultAccess(role, "crm").delete;
      expect(canDeleteCrm, role).toBe(role === "owner" || role === "admin");
    }
  });
});

describe("actor-scoped overrides", () => {
  it("narrows, never grants", () => {
    // This used to sit in front of the role and win outright, so anything that
    // could attach a permission map to an actor could hand itself rights its
    // role did not have.
    const invoice = entity("invoice", "finance");
    const escalated = {
      ...actor("member"),
      permissions: { invoice: { create: true, read: true, update: true, delete: true } },
    };
    expect(flags(getEffectivePermissions(invoice, escalated))).toBe("-R--");
  });

  it("can restrict below the role", () => {
    const deal = entity("deal", "crm");
    const restricted = {
      ...actor("admin"),
      permissions: { deal: { create: false, read: true, update: false, delete: false } },
    };
    expect(flags(getEffectivePermissions(deal, restricted))).toBe("-R--");
  });

  it("only applies to the entity it names", () => {
    const restricted = {
      ...actor("admin"),
      permissions: { deal: { create: false, read: true, update: false, delete: false } },
    };
    expect(flags(getEffectivePermissions(entity("contact", "crm"), restricted))).toBe("CRUD");
  });
});

describe("per-entity exceptions", () => {
  it("wins over the central default when declared", () => {
    const locked = entity("contact", "crm", {
      sales: { create: false, read: true, update: false, delete: false },
    });
    expect(flags(getEffectivePermissions(locked, actor("sales")))).toBe("-R--");
    // Roles it does not name still fall through to the central table.
    expect(flags(getEffectivePermissions(locked, actor("member")))).toBe("-R--");
    expect(flags(getEffectivePermissions(locked, actor("admin")))).toBe("CRUD");
  });
});

describe("capabilities", () => {
  it("keeps billing to the owner", () => {
    expect(hasCapability("owner", "manage:billing")).toBe(true);
    expect(hasCapability("admin", "manage:billing")).toBe(false);
  });

  it("keeps user management to owner and admin", () => {
    for (const role of ROLE_NAMES) {
      expect(hasCapability(role, "manage:users"), role).toBe(role === "owner" || role === "admin");
    }
  });

  it("gives finance the import capability, since it reconciles the data", () => {
    expect(hasCapability("finance", "manage:import")).toBe(true);
    expect(hasCapability("member", "manage:import")).toBe(false);
  });

  it("grants nothing to an unknown role", () => {
    expect(hasCapability("marketing", "manage:users")).toBe(false);
  });
});
