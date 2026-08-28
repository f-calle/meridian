/**
 * Backfill deal.closedAt for deals that closed before the field existed.
 *
 * Going forward the field derives itself on write, but deals already sitting in
 * won or lost have nothing recorded — and they are precisely the rows every
 * trend report needs. The audit log kept what we need: an update row whose diff
 * contains `{"stage": {"from": …, "to": "won"}}`, with the time it happened.
 *
 * Falls back to the deal's updated_at where no audit row exists (imported deals
 * that arrived already closed). That is approximate, and the script says how
 * many rows took the fallback rather than pretending otherwise.
 *
 * Idempotent: only ever fills a NULL.
 *
 *   DATABASE_URL=… pnpm tsx scripts/backfill-closed-at.ts [--dry-run]
 */
import { getSql, closeSql } from "@meridian/core";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const sql = getSql();

  const pending = await sql<{ id: string; updated_at: string }[]>`
    SELECT id, updated_at FROM deal
    WHERE stage IN ('won', 'lost') AND closed_at IS NULL
  `;
  if (pending.length === 0) {
    console.log("Nothing to backfill — every closed deal already has a close date.");
    return;
  }

  // Earliest audit row that moved the deal into a closed stage. Earliest, not
  // latest: a deal won, reopened and won again closed the first time.
  const audited = await sql<{ record_id: string; closed_at: string }[]>`
    SELECT record_id, MIN(created_at) AS closed_at
    FROM audit_log
    WHERE entity_name = 'deal'
      AND action = 'update'
      AND diff -> 'stage' ->> 'to' IN ('won', 'lost')
    GROUP BY record_id
  `;
  const fromAudit = new Map(audited.map((row) => [row.record_id, row.closed_at]));

  let audit = 0;
  let fallback = 0;
  for (const deal of pending) {
    const closedAt = fromAudit.get(deal.id) ?? deal.updated_at;
    fromAudit.has(deal.id) ? audit++ : fallback++;
    if (!dryRun) {
      await sql`UPDATE deal SET closed_at = ${closedAt} WHERE id = ${deal.id} AND closed_at IS NULL`;
    }
  }

  console.log(
    `${dryRun ? "Would backfill" : "Backfilled"} ${pending.length} closed deals: ` +
      `${audit} from the audit trail, ${fallback} approximated from updated_at.`,
  );
}

main()
  .catch((err) => {
    console.error("Backfill failed:", (err as Error).message);
    process.exitCode = 1;
  })
  .finally(closeSql);
