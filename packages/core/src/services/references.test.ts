import { beforeAll, describe, expect, it } from "vitest";
import { defineEntity, field } from "../entity/define-entity.js";
import { entityRegistry } from "../entity/registry.js";
import { describeReferences, inboundRelations, ReferentialIntegrityError, isReferentialIntegrityError } from "./references.js";

const admin = { create: true, read: true, update: true, delete: true };

beforeAll(() => {
  entityRegistry.register(
    defineEntity({
      name: "ref_org",
      label: "Organisation",
      pluralLabel: "Organisations",
      fields: { name: field.string() },
      permissions: { admin },
    }),
  );
  entityRegistry.register(
    defineEntity({
      name: "ref_person",
      label: "Person",
      pluralLabel: "People",
      fields: {
        name: field.string(),
        orgId: field.relation("ref_org"),
        managerId: field.relation("ref_person"),
      },
      permissions: { admin },
    }),
  );
});

describe("inboundRelations", () => {
  it("finds every relation field pointing at an entity", () => {
    expect(inboundRelations("ref_org")).toEqual([{ entity: "ref_person", field: "orgId" }]);
  });

  it("includes self-references", () => {
    expect(inboundRelations("ref_person")).toEqual([{ entity: "ref_person", field: "managerId" }]);
  });

  it("returns nothing for an entity nothing points at", () => {
    expect(inboundRelations("ref_nonexistent")).toEqual([]);
  });
});

describe("describeReferences", () => {
  it("uses the singular label for one referring record", () => {
    const message = describeReferences("ref_org", [{ entity: "ref_person", field: "orgId", count: 1 }]);
    expect(message).toContain("1 person");
    expect(message).toContain("Cannot delete this organisation");
  });

  it("uses the plural label for several", () => {
    expect(
      describeReferences("ref_org", [{ entity: "ref_person", field: "orgId", count: 4 }]),
    ).toContain("4 people");
  });

  it("reads as a sentence when more than one entity refers", () => {
    const message = describeReferences("ref_org", [
      { entity: "ref_person", field: "orgId", count: 2 },
      { entity: "ref_person", field: "managerId", count: 1 },
    ]);
    expect(message).toContain("2 people and 1 person");
  });

  it("tells the user how to proceed", () => {
    expect(
      describeReferences("ref_org", [{ entity: "ref_person", field: "orgId", count: 1 }]),
    ).toContain("delete with detach");
  });
});

describe("ReferentialIntegrityError", () => {
  it("is recognised across realm boundaries by name", () => {
    const err = new ReferentialIntegrityError("ref_org", "some-id", [
      { entity: "ref_person", field: "orgId", count: 1 },
    ]);
    expect(isReferentialIntegrityError(err)).toBe(true);
    // A structured clone loses the prototype but keeps the name.
    expect(isReferentialIntegrityError({ name: "ReferentialIntegrityError" })).toBe(true);
    expect(isReferentialIntegrityError(new Error("nope"))).toBe(false);
  });

  it("carries the references so a caller can render them itself", () => {
    const references = [{ entity: "ref_person", field: "orgId", count: 3 }];
    const err = new ReferentialIntegrityError("ref_org", "some-id", references);
    expect(err.references).toEqual(references);
    expect(err.entityName).toBe("ref_org");
  });
});
