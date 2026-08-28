import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ActorContext } from "@meridian/core";
import { entityRegistry, entityService, verifyToken, isPermissionError } from "@meridian/core";

/**
 * HTTP bridge to the entity engine for MCP clients.
 *
 * This used to read the acting identity out of the request body:
 *
 *     const actor = actorOverride ?? defaultActor;
 *
 * on a server with no authentication, bound to 0.0.0.0. Anyone who could reach
 * the port could name themselves admin of any tenant and get unrestricted CRUD
 * — both the ACL and tenant isolation defeated by one field in a JSON body,
 * with audit rows written under whatever actor id they chose.
 *
 * The identity now comes only from a verified bearer token, exactly as it does
 * on the main API. There is no override and no anonymous fallback: without a
 * valid token the request is refused.
 */

/** Resolve the caller from a signed bearer token, or null. */
function actorFromRequest(req: IncomingMessage): ActorContext | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;

  const payload = verifyToken(auth.slice(7));
  if (!payload) return null;

  return { id: payload.id, type: "agent", tenantId: payload.tenantId, role: payload.role };
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status);
  res.end(JSON.stringify(body));
}

export function createHttpMcpHandler() {
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Content-Type", "application/json");

    // Health is the one unauthenticated route: it reports liveness and nothing
    // about the data.
    if (req.method === "GET" && req.url === "/health") {
      return send(res, 200, { status: "ok", service: "meridian-mcp" });
    }

    const actor = actorFromRequest(req);
    if (!actor) {
      res.setHeader("WWW-Authenticate", "Bearer");
      return send(res, 401, { error: "Unauthorized" });
    }

    if (req.method === "GET" && req.url === "/tools") {
      const tools = entityRegistry.list().map((e) => ({
        name: e.name,
        label: e.label,
        actions: ["list", "read", "create", "update", "delete"],
      }));
      return send(res, 200, { tools });
    }

    if (req.method === "POST" && req.url === "/call") {
      let tool: string;
      let args: Record<string, unknown>;
      try {
        // Note the absent `actor`: the caller does not get to say who they are.
        ({ tool, args } = JSON.parse(await readBody(req)) as {
          tool: string;
          args: Record<string, unknown>;
        });
      } catch {
        return send(res, 400, { error: "Invalid JSON body" });
      }
      if (typeof tool !== "string" || !tool.includes("_")) {
        return send(res, 400, { error: "tool must be of the form <entity>_<action>" });
      }

      const parts = tool.split("_");
      const action = parts.pop()!;
      const entityName = parts.join("_");

      try {
        let result: unknown;
        switch (action) {
          case "list":
            result = await entityService.list(
              entityName,
              { ...args, tenantId: actor.tenantId },
              actor,
            );
            break;
          case "read":
            result = await entityService.read(entityName, args.id as string, actor);
            break;
          case "create":
            result = await entityService.create(entityName, args, actor);
            break;
          case "update":
            result = await entityService.update(entityName, args.id as string, args, actor);
            break;
          case "delete":
            await entityService.delete(entityName, args.id as string, actor);
            result = { success: true };
            break;
          default:
            return send(res, 400, { error: `Unknown action: ${action}` });
        }
        return send(res, 200, { result });
      } catch (err) {
        return send(res, isPermissionError(err) ? 403 : 400, { error: (err as Error).message });
      }
    }

    return send(res, 404, { error: "Not found" });
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      // An unbounded body on an unauthenticated socket is a free OOM.
      if (data.length > 1_000_000) reject(new Error("Body too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/**
 * Start the MCP bridge.
 *
 * Binds to loopback unless MCP_BIND says otherwise. The previous default of
 * 0.0.0.0 meant that adding a public domain to the service — one click in
 * Railway — would have put an unauthenticated CRUD endpoint on the internet.
 * Reaching it from another container is now a deliberate configuration step.
 */
export function startHttpMcpServer(port: number) {
  const host = process.env.MCP_BIND ?? "127.0.0.1";
  const server = createServer(createHttpMcpHandler());
  server.listen(port, host, () => {
    console.log(`MCP HTTP server listening on ${host}:${port}`);
  });
  return server;
}
