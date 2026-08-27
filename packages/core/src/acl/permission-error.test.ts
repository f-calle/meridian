import { describe, expect, it } from "vitest";
import { checkPermission, PermissionError, isPermissionError } from "./permissions.js";
import { defineEntity, field } from "../entity/define-entity.js";
import type { ActorContext } from "../types.js";

const Entity = defineEntity({
  name: "acl_probe",
  label: "Probe",
  fields: { name: field.string() },
  permissions: { member: { create: false, read: true, update: false, delete: false } },
});

describe("isPermissionError", () => {
  it("identifies ACL denials whose message never says 'Permission'", () => {
    // Regression: routes used message.includes("Permission") to pick a status,
    // but PermissionError reads 'Role "member" cannot create acl_probe',
    // so every denial was answered 400 instead of 403.
    let caught: unknown;
    try {
      checkPermission(Entity, { id: "u", type: "user", tenantId: "t", role: "member" } as ActorContext, "create");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PermissionError);
    expect((caught as Error).message).not.toContain("Permission");
    expect(isPermissionError(caught)).toBe(true);
  });

  it("does not classify ordinary errors as denials", () => {
    expect(isPermissionError(new Error("Record not found"))).toBe(false);
    expect(isPermissionError(undefined)).toBe(false);
  });
});
