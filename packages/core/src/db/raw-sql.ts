import postgres from "postgres";

let sqlClient: ReturnType<typeof postgres> | null = null;

export function getSql() {
  if (!sqlClient) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    sqlClient = postgres(url);
  }
  return sqlClient;
}

export async function closeSql() {
  if (sqlClient) {
    await sqlClient.end();
    sqlClient = null;
  }
}
