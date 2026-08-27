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
    ["Northwind Health", "healthcare", "1000+", "northwindhealth.example"],
    ["Solstice Energy", "other", "201-1000", "solsticeenergy.example"],
    ["Tidewater Marine", "manufacturing", "51-200", "tidewatermarine.example"],
    ["Junction Retail Group", "retail", "1000+", "junctionretail.example"],
    ["Fernwood Capital", "finance", "11-50", "fernwoodcapital.example"],
    ["Orbit Robotics", "technology", "51-200", "orbitrobotics.example"],
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
    ["Nadia", "Haddad", "Chief Medical Officer", "Northwind Health", "northwindhealth.example", ["customer"]],
    ["Peter", "Lindqvist", "IT Director", "Northwind Health", "northwindhealth.example", ["customer"]],
    ["Zara", "Mensah", "Head of Procurement", "Solstice Energy", "solsticeenergy.example", ["lead"]],
    ["Owen", "Brady", "Site Supervisor", "Solstice Energy", "solsticeenergy.example", []],
    ["Kenji", "Watanabe", "Operations Director", "Tidewater Marine", "tidewatermarine.example", ["customer"]],
    ["Lucia", "Ferrari", "Quality Manager", "Tidewater Marine", "tidewatermarine.example", []],
    ["Bianca", "Moreau", "VP Merchandising", "Junction Retail Group", "junctionretail.example", ["lead"]],
    ["Hassan", "Malik", "Supply Chain Lead", "Junction Retail Group", "junctionretail.example", ["lead"]],
    ["Greta", "Olsen", "Managing Partner", "Fernwood Capital", "fernwoodcapital.example", ["partner"]],
    ["Felix", "Zhang", "Analyst", "Fernwood Capital", "fernwoodcapital.example", []],
    ["Amara", "Diallo", "Head of Engineering", "Orbit Robotics", "orbitrobotics.example", ["customer"]],
    ["Viktor", "Novak", "Product Lead", "Orbit Robotics", "orbitrobotics.example", ["customer"]],
    ["Rosa", "Delgado", "Office Manager", "Verde Foods", "verdefoods.example", []],
    ["Callum", "Reid", "Finance Director", "Atlas Logistics", "atlaslogistics.example", ["customer"]],
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
    ["Patient records modernization", 210000, "qualified", 45, "Northwind Health", "Peter Lindqvist", 55],
    ["Clinical scheduling module", 78000, "proposal", 60, "Northwind Health", "Nadia Haddad", 18],
    ["Grid maintenance planning", 132000, "qualified", 35, "Solstice Energy", "Zara Mensah", 65],
    ["Field crew mobile app", 58000, "lead", 15, "Solstice Energy", "Owen Brady", 100],
    ["Dry dock scheduling system", 87000, "proposal", 55, "Tidewater Marine", "Kenji Watanabe", 25],
    ["Compliance audit tooling", 33000, "lead", 20, "Tidewater Marine", "Lucia Ferrari", 80],
    ["Multi-store inventory sync", 165000, "qualified", 50, "Junction Retail Group", "Bianca Moreau", 48],
    ["Supplier scorecard portal", 47000, "proposal", 65, "Junction Retail Group", "Hassan Malik", 16],
    ["Portfolio reporting suite", 92000, "qualified", 40, "Fernwood Capital", "Greta Olsen", 38],
    ["Robotics fleet dashboard", 118000, "proposal", 70, "Orbit Robotics", "Amara Diallo", 12],
    ["Firmware release pipeline", 64000, "lead", 25, "Orbit Robotics", "Viktor Novak", 70],
    ["Warehouse labor forecasting", 39000, "lost", 0, "Atlas Logistics", "Callum Reid", -12],
    ["Legacy CRM decommission", 28000, "lost", 0, "Nimbus Software", "Jonas Weber", -20],
    ["Seasonal demand planning", 71000, "lead", 15, "Verde Foods", "Rosa Delgado", 110],
  ];
  const wonDefs: [string, number, string, string, number][] = [
    ["ERP implementation — phase 1", 150000, "Cobalt Manufacturing", "Diane Fournier", 0],
    ["Quarterly audit automation", 42000, "Harbor & Frost", "Tomás Rivera", -3],
    ["Telemetry rollout — full fleet", 128000, "Atlas Logistics", "Priya Nair", -14],
    ["Practice management upgrade", 96000, "Northwind Health", "Nadia Haddad", -28],
    ["Vessel tracking integration", 54000, "Tidewater Marine", "Kenji Watanabe", -45],
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
  console.log(
    `deals: ${dealDefs.length + wonDefs.length} (${wonDefs.length} won → automation fires)`,
  );

  // ── Products ─────────────────────────────────────────────────
  const productDefs: [string, string, number, number, string][] = [
    // name, sku, price, cost, unit
    ["Implementation services", "SVC-IMPL", 175, 95, "hour"],
    ["Solution architecture", "SVC-ARCH", 225, 130, "hour"],
    ["Data migration package", "SVC-MIGR", 6500, 3200, "package"],
    ["Onsite training day", "SVC-TRAIN", 2400, 1100, "day"],
    ["Platform licence — Starter", "LIC-START", 4800, 0, "year"],
    ["Platform licence — Growth", "LIC-GROW", 14400, 0, "year"],
    ["Platform licence — Enterprise", "LIC-ENT", 48000, 0, "year"],
    ["Priority support retainer", "SUP-PRIO", 1250, 400, "month"],
    ["Telemetry sensor unit", "HW-SENS-01", 340, 185, "each"],
    ["Gateway appliance", "HW-GATE-01", 1450, 820, "each"],
    ["Custom integration build", "SVC-INTG", 9800, 4600, "project"],
    ["Annual health check", "SVC-AUDIT", 3600, 1500, "engagement"],
  ];
  for (const [name, sku, price, cost, unit] of productDefs) {
    await findOrCreate("product", "sku", sku, { name, sku, price, cost, unit, active: true });
  }
  console.log(`products: ${productDefs.length}`);

  // ── Quotes & invoices (with real line items) ──────────────────
  type Line = { description: string; quantity: number; unitPrice: number; amount: number };
  const line = (description: string, quantity: number, unitPrice: number): Line => ({
    description,
    quantity,
    unitPrice,
    amount: Number((quantity * unitPrice).toFixed(2)),
  });
  const totalsFor = (lines: Line[], taxRate = 0.1) => {
    const subtotal = Number(lines.reduce((a, l) => a + l.amount, 0).toFixed(2));
    const tax = Number((subtotal * taxRate).toFixed(2));
    return { subtotal, tax, total: Number((subtotal + tax).toFixed(2)) };
  };

  const quoteDefs: [string, string, string, string, number, number, Line[]][] = [
    // number, status, company, contact, issueDays, expiryDays, lines
    ["Q-2026-014", "sent", "Northwind Health", "Nadia Haddad", -6, 24, [
      line("Platform licence — Enterprise", 1, 48000),
      line("Data migration package", 1, 6500),
      line("Implementation services", 120, 175),
    ]],
    ["Q-2026-015", "sent", "Orbit Robotics", "Amara Diallo", -3, 27, [
      line("Platform licence — Growth", 1, 14400),
      line("Custom integration build", 1, 9800),
      line("Onsite training day", 2, 2400),
    ]],
    ["Q-2026-016", "draft", "Junction Retail Group", "Bianca Moreau", 0, 30, [
      line("Platform licence — Enterprise", 1, 48000),
      line("Implementation services", 200, 175),
      line("Priority support retainer", 12, 1250),
    ]],
    ["Q-2026-012", "accepted", "Atlas Logistics", "Priya Nair", -22, 8, [
      line("Telemetry sensor unit", 120, 340),
      line("Gateway appliance", 8, 1450),
      line("Implementation services", 60, 175),
    ]],
    ["Q-2026-009", "declined", "Nimbus Software", "Jonas Weber", -40, -10, [
      line("Platform licence — Starter", 1, 4800),
      line("Onsite training day", 1, 2400),
    ]],
  ];
  for (const [number, status, company, contact, issue, expiry, lines] of quoteDefs) {
    await findOrCreate("quote", "number", number, {
      number,
      status,
      companyId: companies[company],
      contactId: contacts[contact],
      issueDate: daysFromNow(issue),
      expiryDate: daysFromNow(expiry),
      lines,
      ...totalsFor(lines),
      notes: "Prices valid for 30 days. Includes standard onboarding and support.",
    });
  }

  const invoiceDefs: [string, string, string, string, number, number, Line[]][] = [
    // number, status, company, contact, issueDays, dueDays, lines
    ["INV-2026-101", "paid", "Cobalt Manufacturing", "Diane Fournier", -50, -20, [
      line("Platform licence — Enterprise", 1, 48000),
      line("Data migration package", 1, 6500),
      line("Implementation services", 240, 175),
    ]],
    ["INV-2026-108", "paid", "Harbor & Frost", "Tomás Rivera", -34, -4, [
      line("Annual health check", 1, 3600),
      line("Implementation services", 160, 175),
    ]],
    ["INV-2026-112", "sent", "Atlas Logistics", "Callum Reid", -12, 18, [
      line("Telemetry sensor unit", 120, 340),
      line("Gateway appliance", 8, 1450),
    ]],
    ["INV-2026-115", "overdue", "Tidewater Marine", "Kenji Watanabe", -46, -16, [
      line("Custom integration build", 1, 9800),
      line("Onsite training day", 2, 2400),
    ]],
    ["INV-2026-118", "partial", "Northwind Health", "Peter Lindqvist", -25, 5, [
      line("Platform licence — Growth", 1, 14400),
      line("Priority support retainer", 6, 1250),
    ]],
    ["INV-2026-121", "draft", "Lumen Analytics", "Maya Chen", 0, 30, [
      line("Solution architecture", 40, 225),
      line("Implementation services", 80, 175),
    ]],
  ];
  for (const [number, status, company, contact, issue, due, lines] of invoiceDefs) {
    await findOrCreate("invoice", "number", number, {
      number,
      status,
      companyId: companies[company],
      contactId: contacts[contact],
      issueDate: daysFromNow(issue),
      dueDate: daysFromNow(due),
      lines,
      ...totalsFor(lines),
      notes: "Payment due within 30 days. Bank details on file.",
    });
  }
  console.log(`quotes: ${quoteDefs.length}, invoices: ${invoiceDefs.length}`);

  // ── Projects & tasks ─────────────────────────────────────────
  const projectDefs: [string, string, string, number, number][] = [
    ["Lumen analytics platform build", "active", "Lumen Analytics", 84000, 45],
    ["Atlas telemetry pilot", "active", "Atlas Logistics", 36000, 30],
    ["Brightline brand refresh", "planning", "Brightline Studio", 18000, 60],
    ["Northwind records modernization", "active", "Northwind Health", 210000, 120],
    ["Junction inventory sync rollout", "planning", "Junction Retail Group", 165000, 90],
    ["Tidewater dry dock scheduler", "on_hold", "Tidewater Marine", 87000, 75],
    ["Cobalt ERP phase 1", "completed", "Cobalt Manufacturing", 150000, -10],
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
    ["Map legacy record schema", "Northwind records modernization", "done", "high", -8, 32],
    ["Build HL7 import adapter", "Northwind records modernization", "in_progress", "urgent", 5, 60],
    ["Clinician access review", "Northwind records modernization", "review", "high", 2, 16],
    ["Pilot ward cutover plan", "Northwind records modernization", "todo", "medium", 21, 24],
    ["Audit trail retention rules", "Northwind records modernization", "todo", "low", 35, 12],
    ["Store hierarchy modelling", "Junction inventory sync rollout", "in_progress", "high", 6, 28],
    ["POS connector spike", "Junction inventory sync rollout", "todo", "medium", 15, 20],
    ["Stock reconciliation report", "Junction inventory sync rollout", "todo", "medium", 26, 18],
    ["Berth availability model", "Tidewater dry dock scheduler", "todo", "medium", 40, 30],
    ["Finance sign-off", "Cobalt ERP phase 1", "done", "high", -12, 6],
    ["Go-live retrospective", "Cobalt ERP phase 1", "done", "low", -5, 4],
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
    ["call", "Northwind security questionnaire walkthrough", "deal", -3, false],
    ["email", "Send Orbit Robotics revised scope", "deal", 1, false],
    ["meeting", "Junction Retail exec briefing", "company", 4, false],
    ["task", "Chase overdue Tidewater invoice", "invoice", -2, false],
    ["call", "Solstice Energy discovery call", "deal", 3, false],
    ["note", "Bianca wants phased rollout by region", "contact", -1, true],
    ["email", "Quarterly business review deck to Cobalt", "company", 8, false],
    ["meeting", "Fernwood portfolio requirements", "deal", 6, false],
    ["task", "Prepare Northwind pilot success metrics", "project", 9, false],
    ["call", "Follow up: Orbit firmware pipeline scope", "deal", -5, false],
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
  // ── Comments (record timelines) ───────────────────────────────
  async function commentOn(entity: string, id: string, body: string, authorName: string) {
    const existing = await call<{ data: Record<string, unknown>[] }>(
      `/api/comment/list?filter.relatedEntity=${entity}&filter.relatedId=${id}&pageSize=50`,
    );
    if (existing.data.some((c) => c.body === body)) return;
    await create("comment", { relatedEntity: entity, relatedId: id, body, authorName });
  }

  const dealsForComments = await call<{ data: { id: string; title: string }[] }>(
    "/api/deal/list?pageSize=100",
  );
  const dealId = (title: string) => dealsForComments.data.find((d) => d.title === title)?.id;

  const commentPlan: [string, string | undefined, string, string][] = [
    ["deal", dealId("Patient records modernization"), "Security review cleared — legal is the last gate.", "Demo Admin"],
    ["deal", dealId("Patient records modernization"), "Peter asked for a phased cutover by ward. Reworking the plan.", "Demo Admin"],
    ["deal", dealId("Robotics fleet dashboard"), "Amara loved the demo. Sending revised scope tomorrow.", "Demo Admin"],
    ["deal", dealId("Multi-store inventory sync"), "Procurement wants a 3-region pilot before committing.", "Demo Admin"],
    ["deal", dealId("Treasury reporting suite"), "Ingrid prefers annual billing — reflected in the quote.", "Demo Admin"],
    ["project", projects["Northwind records modernization"], "HL7 adapter is the critical path. Everything else can slip a week.", "Demo Admin"],
    ["project", projects["Atlas telemetry pilot"], "8 of 20 trucks fitted. On track for the go-live date.", "Demo Admin"],
  ];
  let commentCount = 0;
  for (const [entity, id, body, author] of commentPlan) {
    if (!id) continue;
    await commentOn(entity, id, body, author);
    commentCount++;
  }

  console.log(`milestones: 2, activities: 17, time entries: 2, comments: ${commentCount}`);

  console.log("Demo data seeded ✔");
}

main().catch((err) => {
  console.error("Demo seed failed:", (err as Error).message);
  process.exit(1);
});
