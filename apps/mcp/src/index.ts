import { registerEntities } from "@meridian/core";
import { allEntities } from "@meridian/entities";
import { startHttpMcpServer } from "@meridian/ai";
import type { ActorContext } from "@meridian/core";

registerEntities(allEntities);

const defaultActor: ActorContext = {
  id: "system-agent",
  type: "agent",
  tenantId: process.env.DEFAULT_TENANT_ID ?? "00000000-0000-0000-0000-000000000001",
  role: "agent",
};

const port = Number(process.env.PORT ?? 8080);
startHttpMcpServer(port, defaultActor);
