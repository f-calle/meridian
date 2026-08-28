/**
 * Backfill deal.closedAt over the REST API.
 *
 * Same job as backfill-closed-at.ts, for deployments whose database sits on a
 * private network and cannot be reached directly. Slower — one request per
 * deal — but it needs nothing but an admin login.
 *
 * The close date comes from the record's audit trail, which recorded the stage
 * change that closed it. Deals with no such entry (imported already closed)
 * are reported and left alone rather than guessed at.
 *
 *   MERIDIAN_API_URL=… MERIDIAN_ADMIN_PASSWORD=… pnpm tsx scripts/backfill-closed-at-api.ts [--dry-run]
 */
const API = process.env.MERIDIAN_API_URL ?? "http://127.0.0.1:3001";
const EMAIL = process.env.MERIDIAN_ADMIN_EMAIL ?? "admin@demo.com";
const PASSWORD = process.env.MERIDIAN_ADMIN_PASSWORD ?? "demo1234";
const dryRun = process.argv.includes("--dry-run");

let token = "";

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

interface AuditEntry {
  action: string;
  diff: Record<string, { from?: unknown; to?: unknown }> | null;
  createdAt: string;
}

async function main() {
  ({ token } = await call<{ token: string }>("/api/auth/login", "POST", {
    email: EMAIL,
    password: PASSWORD,
  }));

  const closed = await call<{ data: Record<string, unknown>[] }>(
    "/api/deal/list?filter.stage.in=won,lost&filter.closedAt.null=1&pageSize=500",
  );
  if (closed.data.length === 0) {
    console.log("Nothing to backfill — every closed deal already has a close date.");
    return;
  }

  let stamped = 0;
  let unknown = 0;
  for (const deal of closed.data) {
    const { entries } = await call<{ entries: AuditEntry[] }>(`/api/deal/audit/${deal.id}`);
    // Earliest close, not latest: a deal won, reopened and won again closed first.
    const closes = entries
      .filter((e) => ["won", "lost"].includes(String(e.diff?.stage?.to ?? "")))
      .map((e) => e.createdAt)
      .sort();

    if (closes.length === 0) {
      unknown++;
      continue;
    }
    if (!dryRun) {
      await call("/api/deal/update", "POST", { id: deal.id, closedAt: closes[0]!.slice(0, 10) });
    }
    stamped++;
  }

  console.log(
    `${dryRun ? "Would stamp" : "Stamped"} ${stamped} of ${closed.data.length} closed deals from ` +
      `the audit trail. ${unknown} had no recorded stage change and were left alone.`,
  );
}

main().catch((err) => {
  console.error("Backfill failed:", (err as Error).message);
  process.exitCode = 1;
});
