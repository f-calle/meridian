import { registerEntities } from "@meridian/core";
import { allEntities } from "@meridian/entities";
import { startHttpMcpServer } from "@meridian/ai";

registerEntities(allEntities);

// Every request authenticates itself with a bearer token, so there is no
// ambient identity here to configure — and no DEFAULT_TENANT_ID to get wrong.
if (process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET) {
  console.error("FATAL: AUTH_SECRET must be set in production — refusing to start");
  process.exit(1);
}

startHttpMcpServer(Number(process.env.PORT ?? 8080));
