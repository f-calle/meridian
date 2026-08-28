const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";

export type AttentionKind =
  | "invoice_overdue"
  | "quote_expiring"
  | "deal_stalled"
  | "deal_closing"
  | "activity_overdue"
  | "task_overdue";

export interface AttentionItem {
  kind: AttentionKind;
  entity: string;
  recordId: string;
  title: string;
  detail: string;
  daysOverdue: number;
  amount?: number;
  severity: "critical" | "warning" | "info";
}

export interface ScheduleItem {
  kind: "activity" | "task";
  entity: string;
  recordId: string;
  title: string;
  detail: string;
  priority?: "low" | "medium" | "high" | "urgent";
  /** ISO instant, or null for something due today with no time attached. */
  at: string | null;
  past: boolean;
}

export interface ScheduleSummary {
  items: ScheduleItem[];
  total: number;
}

export interface AttentionSummary {
  items: AttentionItem[];
  counts: Record<AttentionKind, number>;
  overdueValue: number;
  today: ScheduleSummary;
}

export interface AccentVariant {
  primary: string;
  primaryForeground: string;
  ring: string;
  viz: string;
  contrast: number;
}

export interface AccentVariants {
  light: AccentVariant;
  dark: AccentVariant;
}

export interface Branding {
  accent?: { h: number; s: number };
  logo?: { dataUri: string; mime: string; bytes: number; width: number; height: number };
  logoAlt?: string;
  /** Derived server-side so the client never re-does the contrast search. */
  variants: AccentVariants | null;
}

export interface DashboardMetrics {
  openCount: number;
  openValue: number;
  weightedForecast: number;
  wonValue: number;
  wonCount: number;
  lostCount: number;
  winRate: number | null;
  outstandingValue: number;
  pipeline: { stage: string; count: number; value: number }[];
}

export interface ReportBucket {
  label: string;
  value: number;
  count: number;
}

export interface ReportSet {
  aging: ReportBucket[];
  forecast: ReportBucket[];
  bookings: ReportBucket[];
  stalled: { stage: string; onTrack: number; pastDue: number }[];
  concentration: { name: string; value: number; share: number }[];
  quoteOutcomes: ReportBucket[];
  acceptanceRate: number | null;
}

export interface RelatedGroup {
  entity: string;
  label: string;
  field: string;
  records: Record<string, unknown>[];
  total: number;
  totalValue?: number;
}

export interface RelatedRecords {
  groups: RelatedGroup[];
  rollups: { label: string; value: number; format: "currency" | "number" }[];
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
  tenantName: string;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("meridian_token");
}

export function setToken(token: string) {
  localStorage.setItem("meridian_token", token);
}

export function clearToken() {
  localStorage.removeItem("meridian_token");
}

/** Decode the signed token's payload (name/email/role) for display purposes. */
export function getCurrentUser(): {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  tenantName?: string;
} | null {
  const token = getToken();
  if (!token) return null;
  try {
    const body = token.split(".")[0];
    return JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Request failed");
  }

  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    apiFetch<{ token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  getEntities: () => apiFetch<{ entities: { name: string; label: string; pluralLabel: string }[] }>("/api/entities"),

  getSchema: (entity: string) =>
    apiFetch<{ name: string; label: string; pluralLabel: string; fields: { name: string; type: string; label: string; required?: boolean; options?: string[] }[] }>(
      `/api/entities/${entity}/schema`,
    ),

  list: (
    entity: string,
    params?: {
      page?: number;
      pageSize?: number;
      search?: string;
      sortBy?: string;
      sortOrder?: "asc" | "desc";
      filters?: Record<string, string>;
    },
  ) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
    if (params?.search) qs.set("search", params.search);
    if (params?.sortBy) qs.set("sortBy", params.sortBy);
    if (params?.sortOrder) qs.set("sortOrder", params.sortOrder);
    for (const [k, v] of Object.entries(params?.filters ?? {})) qs.set(`filter.${k}`, v);
    return apiFetch<{ data: Record<string, unknown>[]; total: number; page: number; pageSize: number }>(
      `/api/${entity}/list?${qs}`,
    );
  },

  read: (entity: string, id: string) => apiFetch<Record<string, unknown>>(`/api/${entity}/read/${id}`),

  create: (entity: string, data: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>(`/api/${entity}/create`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (entity: string, id: string, data: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>(`/api/${entity}/update`, {
      method: "POST",
      body: JSON.stringify({ id, ...data }),
    }),

  /**
   * Delete a record. The API refuses with 409 while other records still link to
   * it; `detach` says to clear those links first, which the UI only sends after
   * showing the user what they are.
   */
  delete: (entity: string, id: string, options: { detach?: boolean } = {}) =>
    apiFetch<{ success: boolean }>(
      `/api/${entity}/delete/${id}${options.detach ? "?detach=true" : ""}`,
      { method: "DELETE" },
    ),

  /** Aging, forecast, bookings, stalled pipeline, concentration, quote outcomes. */
  reports: () => apiFetch<ReportSet>("/api/dashboard/reports"),

  getBranding: () => apiFetch<Branding>("/api/branding"),

  /** Admin-only. `null` for accent or logo clears it. */
  updateBranding: (body: {
    accent?: { h: number; s: number } | null;
    logo?: string | null;
    logoAlt?: string;
  }) => apiFetch<Branding>("/api/branding", { method: "POST", body: JSON.stringify(body) }),

  /** The figures the home page leads with. */
  metrics: () => apiFetch<DashboardMetrics>("/api/dashboard/metrics"),

  /**
   * What needs the user, ranked, plus what is on today.
   *
   * The day boundaries come from here rather than the server: the API runs in
   * UTC and the person does not, so only the browser knows when their today
   * starts and ends.
   */
  attention: (limit = 12) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const pad = (n: number) => String(n).padStart(2, "0");
    const date = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
    const params = new URLSearchParams({
      limit: String(limit),
      dayStart: start.toISOString(),
      dayEnd: end.toISOString(),
      date,
    });
    return apiFetch<AttentionSummary>(`/api/dashboard/attention?${params}`);
  },

  /** Records pointing at this one, plus rolled-up value. */
  related: (entity: string, id: string) =>
    apiFetch<RelatedRecords>(`/api/${entity}/related/${id}`),

  briefing: () =>
    apiFetch<{
      generatedAt: string;
      summary: string;
      data: {
        pipeline: { group: string | null; count: number; value: number | null }[];
        openDealCount: number;
        openDealValue: number;
        overdueActivities: Record<string, unknown>[];
        openTasksByStatus: { status: string | null; count: number }[];
        activeProjects: number;
      };
    }>("/api/ai/briefing"),

  chat: (message: string, history?: { role: "user" | "assistant"; content: string }[]) =>
    apiFetch<{ response: string }>("/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({ message, history }),
    }),

  odooConnect: (config: { url: string; database: string; username: string; password: string }) =>
    apiFetch<{ connected: boolean; models: { model: string; entity: string; count: number }[] }>(
      "/api/migration/odoo/connect",
      { method: "POST", body: JSON.stringify(config) },
    ),

  odooImport: (config: { url: string; database: string; username: string; password: string }, dryRun?: boolean) =>
    apiFetch<Record<string, unknown>>("/api/migration/odoo/import", {
      method: "POST",
      body: JSON.stringify({ config, dryRun }),
    }),

  auditLog: (entity: string, id: string) =>
    apiFetch<{ entries: AuditEntry[] }>(`/api/${entity}/audit/${id}`),

  bulkDelete: (entity: string, ids: string[], options: { detach?: boolean } = {}) =>
    apiFetch<{ deleted: string[]; failed: { id: string; error: string }[]; success: boolean }>(
      `/api/${entity}/bulk-delete${options.detach ? "?detach=true" : ""}`,
      { method: "POST", body: JSON.stringify({ ids }) },
    ),

  listUsers: () => apiFetch<{ users: TeamUser[] }>("/api/users"),

  createUser: (data: { email: string; name: string; role: string; password: string }) =>
    apiFetch<TeamUser>("/api/users", { method: "POST", body: JSON.stringify(data) }),

  setUserRole: (id: string, role: string) =>
    apiFetch<{ success: boolean }>(`/api/users/${id}/role`, {
      method: "POST",
      body: JSON.stringify({ role }),
    }),

  deleteUser: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/users/${id}`, { method: "DELETE" }),

  /**
   * Changing a password ends every session for the account, including this one,
   * so the response asks the caller to sign in again.
   */
  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch<{ success: boolean; reauthenticate?: boolean }>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  aggregate: (
    entity: string,
    params: { groupBy?: string; metric?: "count" | "sum" | "avg"; metricField?: string; filters?: Record<string, string> },
  ) => {
    const qs = new URLSearchParams();
    if (params.groupBy) qs.set("groupBy", params.groupBy);
    if (params.metric) qs.set("metric", params.metric);
    if (params.metricField) qs.set("metricField", params.metricField);
    for (const [k, v] of Object.entries(params.filters ?? {})) qs.set(`filter.${k}`, v);
    return apiFetch<{ rows: { group: string | null; count: number; value: number | null }[] }>(
      `/api/${entity}/aggregate?${qs}`,
    );
  },

  convertQuote: (id: string) =>
    apiFetch<{ invoice: Record<string, unknown>; created: boolean }>(`/api/quote/${id}/convert`, {
      method: "POST",
    }),

  csvMap: (csv: string, entity?: string) =>
    apiFetch<{
      entity: string;
      mapping: { column: string; field: string }[];
      externalIdColumn?: string;
      unmapped: { column: string; reason: string }[];
    }>("/api/ai/migration/map", { method: "POST", body: JSON.stringify({ csv, entity }) }),

  csvImport: (payload: {
    csv: string;
    entity: string;
    mapping: { column: string; field: string }[];
    externalIdColumn?: string;
    sourceSystem?: string;
    dryRun?: boolean;
  }) =>
    apiFetch<{ entity: string; created: number; updated: number; skipped: number; errors: string[] }>(
      "/api/migration/csv/import",
      { method: "POST", body: JSON.stringify(payload) },
    ),

  documentPdf: async (entity: string, id: string): Promise<Blob> => {
    const token = getToken();
    const res = await fetch(`${API_URL}/api/documents/${entity}/${id}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((err as { error?: string }).error ?? "PDF generation failed");
    }
    return res.blob();
  },

  draftAutomation: (prompt: string) =>
    apiFetch<AutomationDraft>("/api/ai/automation/draft", {
      method: "POST",
      body: JSON.stringify({ prompt }),
    }),
};

export interface TeamUser {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

export interface AutomationDraft {
  name: string;
  entity: string;
  event: "created" | "updated" | "deleted";
  conditions: unknown[];
  actions: unknown[];
  summary: string;
}

export interface AuditEntry {
  id: string;
  action: "create" | "update" | "delete";
  actorId: string;
  actorType: string;
  diff: Record<string, unknown> | null;
  createdAt: string;
}
