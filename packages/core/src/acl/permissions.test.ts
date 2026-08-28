import { describe, expect, it } from "vitest";
import { checkPermission, PermissionError } from "./permissions.js";
import { defineEntity, field } from "../entity/define-entity.js";
import type { ActorContext } from "../types.js";

const Entity = defineEntity({
  name: "guarded",
  label: "Guarded",
  fields: { name: field.string() },
  permissions: {
    admin: { create: true, read: true, update: true, delete: true },
    member: { create: false, read: true, update: false, delete: false },
  },
});

const actor = (role: string): ActorContext => ({ id: "u", type: "user", tenantId: "t", role });

describe("checkPermission", () => {
  it("allows permitted actions", () => {
    expect(() => checkPermission(Entity, actor("admin"), "delete")).not.toThrow();
    expect(() => checkPermission(Entity, actor("member"), "read")).not.toThrow();
  });

  it("denies forbidden actions", () => {
    expect(() => checkPermission(Entity, actor("member"), "delete")).toThrow(PermissionError);
  });

  it("denies unknown roles", () => {
    expect(() => checkPermission(Entity, actor("stranger"), "read")).toThrow(PermissionError);
  });

  it("refuses to let an actor override grant more than its role", () => {
    // This test used to assert the opposite. The override sat in front of the
    // role and won outright, so anything that could attach a permission map to
    // an actor could hand itself rights the role does not have — and nothing
    // validated or bounded what went in it. It is a ceiling now, not a grant.
    const escalated: ActorContext = {
      ...actor("member"),
      permissions: { guarded: { create: true, read: true, update: true, delete: true } },
    };
    expect(() => checkPermission(Entity, escalated, "delete")).toThrow(PermissionError);
  });

  it("lets an actor override narrow below the role", () => {
    const restricted: ActorContext = {
      ...actor("admin"),
      permissions: { guarded: { create: false, read: true, update: false, delete: false } },
    };
    expect(() => checkPermission(Entity, restricted, "read")).not.toThrow();
    expect(() => checkPermission(Entity, restricted, "delete")).toThrow(PermissionError);
  });
});
