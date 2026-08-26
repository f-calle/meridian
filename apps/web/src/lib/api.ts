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

  list: (entity: string, params?: { page?: number; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.search) qs.set("search", params.search);
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
};
