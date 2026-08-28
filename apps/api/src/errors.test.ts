import { describe, expect, it } from "vitest";
import { PermissionError, ReferentialIntegrityError } from "@meridian/core";
import { ApiError, resolveError } from "./errors.js";

describe("resolveError", () => {
  it("keeps the status an ApiError asked for", () => {
    expect(resolveError(new ApiError(413, "Too big"))).toEqual({
      status: 413,
      message: "Too big",
      unexpected: false,
    });
  });

  it("maps a permission denial to 403, not 400", () => {
    // Routes used to return 400 for these, which reads to a client as "your
    // input was wrong" when the real answer is "you're not allowed".
    const resolved = resolveError(new PermissionError("Role sales cannot delete deal"));
    expect(resolved.status).toBe(403);
    expect(resolved.unexpected).toBe(false);
  });

  it("maps a blocked delete to 409 and keeps the explanation", () => {
    const err = new ReferentialIntegrityError("company", "id", [
      { entity: "contact", field: "companyId", count: 2 },
    ]);
    const resolved = resolveError(err);
    expect(resolved.status).toBe(409);
    expect(resolved.message).toContain("Cannot delete");
  });

  it("turns a driver error into a message that names no SQL", () => {
    // A malformed uuid used to come back as the driver's own text, which quotes
    // the failing statement.
    const resolved = resolveError({
      code: "22P02",
      severity: "ERROR",
      message: 'invalid input syntax for type uuid: "not-a-uuid"',
    });
    expect(resolved.status).toBe(400);
    expect(resolved.message).not.toContain("uuid");
    expect(resolved.message).not.toContain("syntax");
  });

  it("reports a statement timeout as a retryable 503", () => {
    expect(resolveError({ code: "57014" }).status).toBe(503);
  });

  it("reports a unique violation as a conflict", () => {
    expect(resolveError({ code: "23505" }).status).toBe(409);
  });

  it("surfaces validation messages — the user needs those", () => {
    const resolved = resolveError(new Error("Validation failed: firstName: Required"));
    expect(resolved.status).toBe(400);
    expect(resolved.message).toContain("firstName");
    expect(resolved.unexpected).toBe(false);
  });

  it("maps a missing record to 404", () => {
    expect(resolveError(new Error("Record not found: contact/abc")).status).toBe(404);
  });

  it("hides anything it does not recognise behind a generic 500", () => {
    const resolved = resolveError(new Error("connect ECONNREFUSED 10.0.0.4:5432"));
    expect(resolved.status).toBe(500);
    expect(resolved.message).not.toContain("10.0.0.4");
    expect(resolved.unexpected).toBe(true);
  });
});

describe("query-shaping errors", () => {
  it("reports an unknown filter operator as a bad request", () => {
    // These name only what the caller sent, so the message is safe to return —
    // and a 500 would tell them the server broke when their query did.
    const resolved = resolveError(new Error('Unknown filter operator in "filter.total.drop"'));
    expect(resolved.status).toBe(400);
    expect(resolved.message).toContain("filter.total.drop");
    expect(resolved.unexpected).toBe(false);
  });

  it("reports an unknown filter or sort field as a bad request", () => {
    expect(resolveError(new Error("Unknown filter field: password")).status).toBe(400);
    expect(resolveError(new Error("Unknown sort field: password")).status).toBe(400);
  });
});
