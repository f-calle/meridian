import postgres from "postgres";
import { baseConnectionOptions, statementTimeoutMs } from "./connection-options.js";

let sqlClient: ReturnType<typeof postgres> | null = null;

export function getSql() {
  if (!sqlClient) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    sqlClient = postgres(url, {
      ...baseConnectionOptions(),
      connection: { statement_timeout: statementTimeoutMs() },
    });
  }
  return sqlClient;
}

export async function closeSql() {
  if (sqlClient) {
    await sqlClient.end();
    sqlClient = null;
  }
}
