/**
 * Seed a Meridian instance with realistic (fictional) demo data via its API.
 *
 * Usage:
 *   MERIDIAN_API_URL=https://api.example.com \
 *   MERIDIAN_ADMIN_EMAIL=admin@demo.com \
 *   MERIDIAN_ADMIN_PASSWORD=demo1234 \
 *   pnpm tsx scripts/seed-demo.ts
 *
 * Idempotent: every record is find-or-create, so partial runs resume cleanly.
 * Two deals are moved to "won" after creation so the seeded
 * "Won deal → kickoff project" automation visibly fires.
 */

const API = process.env.MERIDIAN_API_URL ?? "http://127.0.0.1:3001";
const EMAIL = process.env.MERIDIAN_ADMIN_EMAIL ?? "admin@demo.com";
const PASSWORD = process.env.MERIDIAN_ADMIN_PASSWORD ?? "demo1234";

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
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`${method} ${path}: ${(err as { error?: string }).error ?? res.status}`);
  }
  return res.json() as Promise<T>;
}

const create = (entity: string, data: Record<string, unknown>) =>
  call<{ id: string }>(`/api/${entity}/create`, "POST", data);

/** Find a record whose `field` equals `value` (via search), else create it. */
async function findOrCreate(
  entity: string,
  field: string,
  value: string,
  data: Record<string, unknown>,
): Promise<{ id: string; created: boolean }> {
  const found = await call<{ data: Record<string, unknown>[] }>(
    `/api/${entity}/list?search=${encodeURIComponent(value)}`,
  );
  const match = found.data.find((r) => r[field] === value);
  if (match) return { id: String(match.id), created: false };
  const c = await create(entity, data);
  return { id: c.id, created: true };
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/** ASCII-only email local part from a human name ("Tomás" → "tomas"). */
function emailSlug(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "");
}

async function main() {
  const login = await call<{ token: string }>("/api/auth/login", "POST", {
    email: EMAIL,
    password: PASSWORD,
  });
  token = login.token;


  // ── Companies ────────────────────────────────────────────────
  const companies: Record<string, string> = {};
  const companyDefs: [string, string, string, string][] = [
    ["Lumen Analytics", "technology", "11-50", "lumenanalytics.example"],
    ["Harbor & Frost", "finance", "51-200", "harborfrost.example"],
    ["Atlas Logistics", "manufacturing", "201-1000", "atlaslogistics.example"],
    ["Verde Foods", "retail", "51-200", "verdefoods.example"],
    ["Nimbus Software", "technology", "1-10", "nimbus.example"],
    ["Brightline Studio", "other", "1-10", "brightline.example"],
    ["Cobalt Manufacturing", "manufacturing", "1000+", "cobaltmfg.example"],
    ["Peak Realty", "other", "11-50", "peakrealty.example"],
  ];
  for (const [name, industry, size, domain] of companyDefs) {
    const r = await findOrCreate("company", "name", name, {
      name,
      industry,
      size,
      website: `https://www.${domain}`,
      email: `hello@${domain}`,
    });
    companies[name] = r.id;
  }
  console.log(`companies: ${companyDefs.length}`);

  // ── Contacts ─────────────────────────────────────────────────
  const contacts: Record<string, string> = {};
  const contactDefs: [string, string, string, string, string, string[]][] = [
    ["Maya", "Chen", "CTO", "Lumen Analytics", "lumenanalytics.example", ["customer"]],
    ["Derek", "Okafor", "Head of Data", "Lumen Analytics", "lumenanalytics.example", ["customer"]],
    ["Ingrid", "Larsen", "CFO", "Harbor & Frost", "harborfrost.example", ["lead"]],
    ["Tomás", "Rivera", "Controller", "Harbor & Frost", "harborfrost.example", ["lead"]],
    ["Priya", "Nair", "VP Operations", "Atlas Logistics", "atlaslogistics.example", ["customer"]],
    ["Samuel", "Adeyemi", "Fleet Manager", "Atlas Logistics", "atlaslogistics.example", []],
    ["Elena", "Rossi", "Procurement Lead", "Verde Foods", "verdefoods.example", ["lead"]],
    ["Jonas", "Weber", "CEO", "Nimbus Software", "nimbus.example", ["partner"]],
    ["Aisha", "Karim", "Creative Director", "Brightline Studio", "brightline.example", ["customer"]],
    ["Robert", "Kowalski", "Plant Manager", "Cobalt Manufacturing", "cobaltmfg.example", ["lead"]],
    ["Diane", "Fournier", "COO", "Cobalt Manufacturing", "cobaltmfg.example", ["lead"]],
    ["Marcus", "Hale", "Broker", "Peak Realty", "peakrealty.example", ["vendor"]],
  ];
  for (const [firstName, lastName, title, company, domain, tags] of contactDefs) {
    const email = `${emailSlug(firstName)}.${emailSlug(lastName)}@${domain}`;
    const r = await findOrCreate("contact", "email", email, {
      firstName,
      lastName,
      title,
      email,
      companyId: companies[company],
      tags,
    });
    contacts[`${firstName} ${lastName}`] = r.id;
  }
  console.log(`contacts: ${contactDefs.length}`);

  // ── Deals (two get won afterwards → automation creates projects) ──
  const dealDefs: [string, number, string, number, string, string, number][] = [
    // title, value, stage, probability, company, contact, expectedClose (days)
    ["Analytics platform rollout", 84000, "proposal", 65, "Lumen Analytics", "Maya Chen", 21],
    ["Treasury reporting suite", 120000, "qualified", 40, "Harbor & Frost", "Ingrid Larsen", 45],
    ["Fleet telemetry pilot", 36000, "proposal", 55, "Atlas Logistics", "Priya Nair", 14],
    ["Store inventory revamp", 52000, "lead", 15, "Verde Foods", "Elena Rossi", 60],
    ["OEM integration partnership", 24000, "qualified", 50, "Nimbus Software", "Jonas Weber", 30],
    ["Brand system retainer", 18000, "proposal", 70, "Brightline Studio", "Aisha Karim", 10],
    ["Factory floor sensors", 96000, "lead", 20, "Cobalt Manufacturing", "Robert Kowalski", 75],
    ["Office relocation services", 15000, "lost", 0, "Peak Realty", "Marcus Hale", -5],
    ["Data warehouse migration", 64000, "qualified", 45, "Lumen Analytics", "Derek Okafor", 40],
    ["Cold-chain monitoring", 44000, "lead", 10, "Verde Foods", "Elena Rossi", 90],
  ];
  const wonDefs: [string, number, string, string, number][] = [
    ["ERP implementation — phase 1", 150000, "Cobalt Manufacturing", "Diane Fournier", 0],
    ["Quarterly audit automation", 42000, "Harbor & Frost", "Tomás Rivera", -3],
  ];
  for (const [title, value, stage, probability, company, contact, close] of dealDefs) {
    await findOrCreate("deal", "title", title, {
      title,
      value,
      stage,
      probability,
      companyId: companies[company],
      contactId: contacts[contact],
      expectedClose: daysFromNow(close),
    });
  }
  for (const [title, value, company, contact, close] of wonDefs) {
    const d = await findOrCreate("deal", "title", title, {
      title,
      value,
      stage: "proposal",
      probability: 90,
      companyId: companies[company],
      contactId: contacts[contact],
      expectedClose: daysFromNow(close),
    });
    if (d.created) {
      await call(`/api/deal/update`, "POST", { id: d.id, stage: "won", probability: 100 });
    }
  }
  console.log(`deals: ${dealDefs.length + wonDefs.length} (2 won → automation fires)`);

  // ── Projects & tasks ─────────────────────────────────────────
  const projectDefs: [string, string, string, number, number][] = [
    ["Lumen analytics platform build", "active", "Lumen Analytics", 84000, 45],
    ["Atlas telemetry pilot", "active", "Atlas Logistics", 36000, 30],
    ["Brightline brand refresh", "planning", "Brightline Studio", 18000, 60],
  ];
  const projects: Record<string, string> = {};
  for (const [name, status, company, budget, deadline] of projectDefs) {
    const r = await findOrCreate("project", "name", name, {
      name,
      status,
      companyId: companies[company],
      budget,
      deadline: daysFromNow(deadline),
    });
    projects[name] = r.id;
  }

  const taskDefs: [string, string, string, string, number, number][] = [
    // title, project, status, priority, dueDays, estHours
    ["Ingest pipeline for POS data", "Lumen analytics platform build", "in_progress", "high", 3, 24],
    ["Dashboard: revenue overview", "Lumen analytics platform build", "todo", "medium", 7, 16],
    ["Access control & SSO", "Lumen analytics platform build", "review", "high", 1, 12],
    ["Load-test reporting queries", "Lumen analytics platform build", "todo", "low", 14, 8],
    ["Install trackers on 20 trucks", "Atlas telemetry pilot", "in_progress", "urgent", 2, 40],
    ["Real-time position map", "Atlas telemetry pilot", "todo", "high", 9, 20],
    ["Driver mobile check-in flow", "Atlas telemetry pilot", "todo", "medium", 12, 18],
    ["Moodboards & direction", "Brightline brand refresh", "done", "medium", -2, 10],
    ["Logo exploration round 1", "Brightline brand refresh", "in_progress", "high", 4, 14],
    ["Type & color system", "Brightline brand refresh", "todo", "medium", 11, 12],
  ];
  const tasks: Record<string, string> = {};
  for (const [title, project, status, priority, due, estimatedHours] of taskDefs) {
    const r = await findOrCreate("task", "title", title, {
      title,
      projectId: projects[project],
      status,
      priority,
      dueDate: daysFromNow(due),
      estimatedHours,
    });
    tasks[title] = r.id;
  }
  console.log(`projects: ${projectDefs.length}, tasks: ${taskDefs.length}`);

  // ── Milestones, activities, time entries ─────────────────────
  await findOrCreate("milestone", "title", "Pilot go-live", {
    title: "Pilot go-live",
    projectId: projects["Atlas telemetry pilot"],
    dueDate: daysFromNow(20),
    status: "in_progress",
  });
  await findOrCreate("milestone", "title", "Analytics MVP demo", {
    title: "Analytics MVP demo",
    projectId: projects["Lumen analytics platform build"],
    dueDate: daysFromNow(10),
    status: "pending",
  });

  const activityDefs: [string, string, string, number, boolean][] = [
    // type, subject, relatedEntity, dueDays, completed
    ["call", "Follow up on treasury suite proposal", "deal", -1, false],
    ["email", "Send revised pricing to Verde Foods", "deal", -2, false],
    ["meeting", "Quarterly review with Lumen", "company", 5, false],
    ["call", "Intro call with Cobalt plant team", "deal", 2, false],
    ["note", "Ingrid prefers annual billing", "contact", 0, true],
    ["task", "Prepare pilot success metrics", "project", 6, false],
    ["meeting", "Brand kickoff workshop", "project", -4, true],
  ];
  for (const [type, subject, relatedEntity, due, completed] of activityDefs) {
    await findOrCreate("activity", "subject", subject, {
      type,
      subject,
      relatedEntity,
      dueDate: new Date(Date.now() + due * 86_400_000).toISOString(),
      completed,
    });
  }

  const teCount = await call<{ total: number }>("/api/time_entry/list?pageSize=1");
  if (teCount.total === 0) {
  await create("time_entry", {
    taskId: tasks["Ingest pipeline for POS data"],
    projectId: projects["Lumen analytics platform build"],
    userId: "Demo Admin",
    hours: 6,
    date: daysFromNow(-1),
    description: "Schema design and first ingestion job",
    billable: true,
  });
  await create("time_entry", {
    taskId: tasks["Install trackers on 20 trucks"],
    projectId: projects["Atlas telemetry pilot"],
    userId: "Demo Admin",
    hours: 8,
    date: daysFromNow(0),
    description: "On-site installation, first 8 vehicles",
    billable: true,
  });
  }
  console.log("milestones: 2, activities: 7, time entries: 2");

  console.log("Demo data seeded ✔");
}

main().catch((err) => {
  console.error("Demo seed failed:", (err as Error).message);
  process.exit(1);
});
