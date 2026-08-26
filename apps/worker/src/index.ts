import { Worker, Queue } from "bullmq";
import { Redis } from "ioredis";
import { registerEntities } from "@meridian/core";
import { allEntities } from "@meridian/entities";
import { OdooAdapter } from "@meridian/migration";
import type { ActorContext } from "@meridian/core";

registerEntities(allEntities);

const connection = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null,
});

export const migrationQueue = new Queue("migration", { connection });

const worker = new Worker(
  "migration",
  async (job) => {
    console.log(`Processing migration job ${job.id}:`, job.name);

    switch (job.name) {
      case "odoo-import": {
        const { config, models, dryRun, actor } = job.data as {
          config: { url: string; database: string; username: string; password: string };
          models?: string[];
          dryRun?: boolean;
          actor: ActorContext;
        };
        const adapter = new OdooAdapter(config);
        const report = await adapter.runMigration(actor, models, dryRun);
        return report;
      }
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
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

console.log("Meridian worker started");
