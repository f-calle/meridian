export type EntityField = {
  name: string;
  type: string;
  label: string;
  required?: boolean;
  options?: string[];
  relation?: string;
};

export function formatFieldValue(value: unknown, type?: string): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (type === "currency") {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
    }
    return value.toLocaleString();
  }
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export function recordLabel(record: Record<string, unknown>): string {
  if (record.firstName || record.lastName) {
    return [record.firstName, record.lastName].filter(Boolean).join(" ") || "Untitled";
  }
  const name = record.name ?? record.title ?? record.label ?? record.id;
  return name ? String(name) : "this record";
}

export function recordTitle(record: Record<string, unknown>, label: string): string {
  return recordLabel(record) === "this record" || recordLabel(record) === "Untitled"
    ? `${label} ${String(record.id ?? "").slice(0, 8)}`
    : recordLabel(record);
}
