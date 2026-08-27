import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { baseConnectionOptions } from "./connection-options.js";
import * as systemSchema from "./schema.js";
import * as entitySchema from "./entity-schema.generated.js";

const schema = { ...systemSchema, ...entitySchema };

let client: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set");
    }
    client = postgres(url, baseConnectionOptions());
    db = drizzle(client, { schema });
  }
  return db;
}

export async function closeDb() {
  if (client) {
    await client.end();
    client = null;
    db = null;
  }
}

export { schema };
