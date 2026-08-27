import { describe, expect, it } from "vitest";
import { validateEntityData } from "./validation.js";
import { defineEntity, field } from "./define-entity.js";

const TestEntity = defineEntity({
  name: "test_thing",
  label: "Thing",
  fields: {
    name: field.string({ required: true }),
    email: field.email(),
    stage: field.select(["a", "b"], { default: "a" }),
    amount: field.currency(),
    meta: field.json(),
    stages: field.json({ default: ["x"] }),
  },
  permissions: { admin: { create: true, read: true, update: true, delete: true } },
});

describe("validateEntityData", () => {
  it("accepts valid data and applies defaults", () => {
    const result = validateEntityData(TestEntity, { name: "Widget" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stage).toBe("a");
      expect(result.data.stages).toEqual(["x"]);
    }
  });

  it("rejects missing required fields", () => {
    const result = validateEntityData(TestEntity, {});
    expect(result.success).toBe(false);
  });

  it("rejects invalid emails and enum values", () => {
    expect(validateEntityData(TestEntity, { name: "x", email: "nope" }).success).toBe(false);
    expect(validateEntityData(TestEntity, { name: "x", stage: "z" }).success).toBe(false);
  });

  it("accepts both objects and arrays for json fields", () => {
    expect(validateEntityData(TestEntity, { name: "x", meta: { a: 1 } }).success).toBe(true);
    expect(validateEntityData(TestEntity, { name: "x", meta: [{ a: 1 }] }).success).toBe(true);
  });

  it("supports partial validation for updates", () => {
    const result = validateEntityData(TestEntity, { amount: 12.5 }, true);
    expect(result.success).toBe(true);
  });

  it("does not re-apply defaults on partial updates", () => {
    const result = validateEntityData(TestEntity, { amount: 12.5 }, true);
    expect(result.success).toBe(true);
    if (result.success) {
      // stage/stages have defaults but were not sent — they must not be
      // returned, or every update would reset them.
      expect(result.data).toEqual({ amount: 12.5 });
    }
  });
});
