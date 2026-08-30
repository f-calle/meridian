import { Worker, Queue } from "bullmq";
import { Redis } from "ioredis";
import { registerEntities, startAutomationEngine, refreshConfiguredDemoTenant } from "@meridian/core";
import { allEntities } from "@meridian/entities";
import { OdooAdapter } from "@meridian/migration";
import type { ActorContext } from "@meridian/core";

registerEntities(allEntities);
startAutomationEngine();

const connection = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null,
});

export const migrationQueue = new Queue("migration", { connection });

/**
 * The tenant whose seeded schedule is re-dated nightly, by slug.
 *
 * Unset by default, which disables the job entirely. A scheduled rewrite of
 * due dates has to be opted into by name — nothing about an ordinary install
 * should put a real customer's calendar within reach of it.
 */
const DEMO_TENANT_SLUG = process.env.DEMO_REFRESH_TENANT_SLUG;

interface OdooImportJob {
  config: { url: string; database: string; username: string; password: string };
  models?: string[];
  dryRun?: boolean;
  actor: ActorContext;
}

async function runOdooImport(data: OdooImportJob): Promise<unknown> {
  const { config, models, dryRun, actor } = data;
  return new OdooAdapter(config).runMigration(actor, models, dryRun);
}

async function runDemoRefresh(): Promise<unknown> {
  const result = await refreshConfiguredDemoTenant(DEMO_TENANT_SLUG);
  if (!result) {
    console.log("Demo refresh: no tenant configured, or the slug matched nothing");
    return { skipped: true };
  }
  console.log(`Demo refresh: moved ${result.activities} activities and ${result.tasks} tasks`);
  return result;
}

/**
 * One entry per job name.
 *
 * A table rather than a switch: adding a job is adding a line here and a
 * function above, and the "unknown job" case stays a single lookup miss.
 */
const handlers: Record<string, (data: unknown) => Promise<unknown>> = {
  // Each entry casts once, here, because a queue payload arrives as JSON and
  // this is the boundary where it stops being unknown.
  "odoo-import": (data) => runOdooImport(data as OdooImportJob),
  "demo-refresh": () => runDemoRefresh(),
};

const worker = new Worker(
  "migration",
  async (job) => {
    console.log(`Processing job ${job.id}:`, job.name);
    const handler = handlers[job.name];
    if (!handler) throw new Error(`Unknown job type: ${job.name}`);
    return handler(job.data);
  },
  {
    connection,
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 5),
  },
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

/**
 * Schedule the nightly demo refresh, replacing any previously registered one.
 *
 * The old scheduler is cleared first because BullMQ keys a repeatable job by
 * its pattern: changing the cron without this leaves the previous schedule
 * running as well, and the demo tenant gets re-dated twice a night by two jobs
 * nobody remembers creating.
 */
async function scheduleDemoRefresh(pattern: string): Promise<void> {
  for (const existing of await migrationQueue.getRepeatableJobs()) {
    if (existing.name !== "demo-refresh") continue;
    await migrationQueue.removeRepeatableByKey(existing.key);
  }
  await migrationQueue.add("demo-refresh", {}, { repeat: { pattern }, removeOnComplete: 10 });
  console.log(`Demo refresh scheduled (${pattern}) for tenant "${DEMO_TENANT_SLUG}"`);
}

if (DEMO_TENANT_SLUG) {
  scheduleDemoRefresh(process.env.DEMO_REFRESH_CRON ?? "0 3 * * *").catch((err: Error) => {
    // A failed schedule must not take the worker down with it: migrations are
    // the job this process exists for, and they are unaffected.
    console.error("Could not schedule demo refresh:", err.message);
  });
}

console.log("Meridian worker started");
