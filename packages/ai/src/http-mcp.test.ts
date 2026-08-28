import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { registerEntities, signToken, entityRegistry } from "@meridian/core";
import { allEntities } from "@meridian/entities";
import { startHttpMcpServer } from "./http-mcp.js";

/**
 * These assert the fix for a real hole: /call used to take the acting identity
 * from the request body on a server with no authentication, so any caller could
 * name themselves admin of any tenant.
 */

let server: Server;
let base: string;

beforeEach(async () => {
  if (entityRegistry.list().length === 0) registerEntities(allEntities);
  process.env.AUTH_SECRET = "test-secret-for-mcp";
  server = startHttpMcpServer(0);
  // listen() is async — the address is null until it fires.
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(() => {
  server.close();
});

const victimTenant = "11111111-1111-1111-1111-111111111111";

describe("MCP bridge authentication", () => {
  it("serves health without a token", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ service: "meridian-mcp" });
  });

  it("refuses an unauthenticated call", async () => {
    const res = await fetch(`${base}/call`, {
      method: "POST",
      body: JSON.stringify({ tool: "contact_list", args: {} }),
    });
    expect(res.status).toBe(401);
  });

  it("refuses an unauthenticated tools listing", async () => {
    // The entity list is a map of the deployment; it was public before.
    expect((await fetch(`${base}/tools`)).status).toBe(401);
  });

  it("ignores an actor supplied in the body", async () => {
    // The original attack: name yourself admin of someone else's tenant.
    const res = await fetch(`${base}/call`, {
      method: "POST",
      body: JSON.stringify({
        tool: "contact_list",
        args: {},
        actor: { id: "attacker", type: "agent", tenantId: victimTenant, role: "admin" },
      }),
    });
    expect(res.status).toBe(401);
  });

  it("refuses a token that is not signed with our secret", async () => {
    const res = await fetch(`${base}/call`, {
      method: "POST",
      headers: { Authorization: "Bearer eyJpZCI6ImF0dGFja2VyIn0.deadbeef" },
      body: JSON.stringify({ tool: "contact_list", args: {} }),
    });
    expect(res.status).toBe(401);
  });

  it("refuses an expired token", async () => {
    const token = signToken(
      { id: "u1", email: "u@x.test", name: "U", role: "admin", tenantId: victimTenant },
      -60,
    );
    const res = await fetch(`${base}/call`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tool: "contact_list", args: {} }),
    });
    expect(res.status).toBe(401);
  });

  it("accepts a valid token and lists tools", async () => {
    const token = signToken({
      id: "u1",
      email: "u@x.test",
      name: "U",
      role: "admin",
      tenantId: victimTenant,
    });
    const res = await fetch(`${base}/tools`, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tools: { name: string }[] };
    expect(body.tools.map((t) => t.name)).toContain("contact");
  });

  it("rejects a malformed tool name before touching the entity engine", async () => {
    const token = signToken({
      id: "u1",
      email: "u@x.test",
      name: "U",
      role: "admin",
      tenantId: victimTenant,
    });
    const res = await fetch(`${base}/call`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tool: "nonsense", args: {} }),
    });
    expect(res.status).toBe(400);
  });
});
