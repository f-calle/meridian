const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";

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
export function getCurrentUser(): { id?: string; name?: string; email?: string; role?: string } | null {
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

  delete: (entity: string, id: string) =>
    apiFetch<{ success: boolean }>(`/api/${entity}/delete/${id}`, { method: "DELETE" }),

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

  bulkDelete: (entity: string, ids: string[]) =>
    apiFetch<{ deleted: string[]; failed: { id: string; error: string }[]; success: boolean }>(
      `/api/${entity}/bulk-delete`,
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

  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch<{ success: boolean }>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
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
