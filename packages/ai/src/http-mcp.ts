import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ActorContext } from "@meridian/core";
import { entityRegistry, entityService } from "@meridian/core";

export function createHttpMcpHandler(defaultActor: ActorContext) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Content-Type", "application/json");

    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200);
      res.end(JSON.stringify({ status: "ok", service: "meridian-mcp" }));
      return;
    }

    if (req.method === "GET" && req.url === "/tools") {
      const entities = entityRegistry.list();
      const tools = entities.map((e) => ({
        name: e.name,
        label: e.label,
        actions: ["list", "read", "create", "update", "delete"],
      }));
      res.writeHead(200);
      res.end(JSON.stringify({ tools }));
      return;
    }

    if (req.method === "POST" && req.url === "/call") {
      const body = await readBody(req);
      const { tool, args, actor: actorOverride } = JSON.parse(body) as {
        tool: string;
        args: Record<string, unknown>;
        actor?: ActorContext;
      };

      const actor = actorOverride ?? defaultActor;
      const parts = tool.split("_");
      const action = parts.pop()!;
      const entityName = parts.join("_");

      try {
        let result: unknown;
        switch (action) {
          case "list":
            result = await entityService.list(entityName, { tenantId: actor.tenantId, ...args }, actor);
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
            throw new Error(`Unknown action: ${action}`);
        }
        res.writeHead(200);
        res.end(JSON.stringify({ result }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export function startHttpMcpServer(port: number, actor: ActorContext) {
  const handler = createHttpMcpHandler(actor);
  const server = createServer(handler);
  server.listen(port, "0.0.0.0", () => {
    console.log(`MCP HTTP server listening on port ${port}`);
  });
  return server;
}
