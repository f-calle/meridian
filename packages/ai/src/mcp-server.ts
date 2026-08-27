import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { ActorContext } from "@meridian/core";
import { entityRegistry, entityService } from "@meridian/core";

export function createMcpServer(actor: ActorContext) {
  const server = new Server(
    { name: "meridian", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const entities = entityRegistry.list();
    const tools = entities.flatMap((entity) => [
      {
        name: `${entity.name}_list`,
        description: `List ${entity.pluralLabel ?? entity.label + "s"}`,
        inputSchema: {
          type: "object",
          properties: {
            search: { type: "string", description: "Search query" },
            page: { type: "number", description: "Page number" },
            pageSize: { type: "number", description: "Items per page" },
          },
        },
      },
      {
        name: `${entity.name}_read`,
        description: `Read a single ${entity.label} by ID`,
        inputSchema: {
          type: "object",
          properties: { id: { type: "string", description: "Record ID" } },
          required: ["id"],
        },
      },
      {
        name: `${entity.name}_create`,
        description: `Create a new ${entity.label}`,
        inputSchema: {
          type: "object",
          properties: Object.fromEntries(
            Object.entries(entity.fields).map(([name, def]) => [
              name,
              { type: "string", description: def.label ?? name },
            ]),
          ),
        },
      },
      {
        name: `${entity.name}_update`,
        description: `Update an existing ${entity.label}`,
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Record ID" },
            ...Object.fromEntries(
              Object.entries(entity.fields).map(([name, def]) => [
                name,
                { type: "string", description: def.label ?? name },
              ]),
            ),
          },
          required: ["id"],
        },
      },
      {
        name: `${entity.name}_delete`,
        description: `Delete a ${entity.label}`,
        inputSchema: {
          type: "object",
          properties: { id: { type: "string", description: "Record ID" } },
          required: ["id"],
        },
      },
    ]);

    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const parts = name.split("_");
    const action = parts.pop()!;
    const entityName = parts.join("_");

    try {
      let result: unknown;

      switch (action) {
        case "list":
          result = await entityService.list(
            entityName,
            {
              tenantId: actor.tenantId,
              search: (args as Record<string, unknown>)?.search as string,
              page: (args as Record<string, unknown>)?.page as number,
              pageSize: (args as Record<string, unknown>)?.pageSize as number,
            },
            actor,
          );
          break;
        case "read":
          result = await entityService.read(entityName, (args as { id: string }).id, actor);
          break;
        case "create": {
          const { ...data } = args as Record<string, unknown>;
          result = await entityService.create(entityName, data, actor);
          break;
        }
        case "update": {
          const { id, ...data } = args as Record<string, unknown> & { id: string };
          result = await entityService.update(entityName, id, data, actor);
          break;
        }
        case "delete":
          await entityService.delete(entityName, (args as { id: string }).id, actor);
          result = { success: true };
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  });

  return server;
}

export async function startMcpServer(actor: ActorContext) {
  const server = createMcpServer(actor);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export { createHttpMcpHandler } from "./http-mcp.js";
export { AgentOrchestrator } from "./orchestrator.js";
