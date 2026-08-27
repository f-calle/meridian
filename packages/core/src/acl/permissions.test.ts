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

  it("honors actor permission overrides", () => {
    const overridden: ActorContext = {
      ...actor("member"),
      permissions: { guarded: { create: true, read: true, update: true, delete: true } },
    };
    expect(() => checkPermission(Entity, overridden, "delete")).not.toThrow();
  });
});
