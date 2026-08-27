#!/usr/bin/env node
import { registerEntities } from "@meridian/core";
import { allEntities } from "@meridian/entities";

registerEntities(allEntities);

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case "entities":
      await listEntities();
      break;
    case "health":
      await checkHealth();
      break;
    case "help":
    default:
      printHelp();
  }
}

function printHelp() {
  console.log(`
Meridian CLI — AI-native ERP platform

Usage:
  meridian entities          List all registered entities
  meridian health            Check API health
  meridian help              Show this help

Environment:
  API_URL                    API server URL (default: http://127.0.0.1:3001)
`);
}

async function listEntities() {
  console.log("Registered entities:\n");
  for (const entity of allEntities) {
    const fieldCount = Object.keys(entity.fields).length;
    console.log(`  ${entity.name.padEnd(15)} ${entity.label.padEnd(15)} ${fieldCount} fields`);
  }
  console.log(`\nTotal: ${allEntities.length} entities`);
}

async function checkHealth() {
  const apiUrl = process.env.API_URL ?? "http://127.0.0.1:3001";
  try {
    const res = await fetch(`${apiUrl}/health`);
    const data = (await res.json()) as { status: string };
    console.log(`API: ${data.status} (${apiUrl})`);
  } catch {
    console.error(`API: unreachable (${apiUrl})`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
