export type EntityField = {
  name: string;
  type: string;
  label: string;
  required?: boolean;
  options?: string[];
  relation?: string;
};

const DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * A stored date or timestamp, written the way a person reads one.
 *
 * A `date` is a calendar day, not a moment, so it is formatted from its digits
 * rather than by building a Date: the column holds either "2026-07-14" or that
 * same day stamped at UTC midnight, and both become the 13th of July for
 * anyone west of Greenwich the moment you let a timezone touch them.
 *
 * A `datetime` really is an instant, so that one is converted to local time,
 * which is the whole point of storing it as one.
 */
function formatTemporal(value: string, type: "date" | "datetime"): string | null {
  if (type === "date") {
    const parts = DATE_PREFIX.exec(value);
    if (!parts) return null;
    const [, year, month, day] = parts as unknown as [string, string, string, string];
    const local = new Date(Number(year), Number(month) - 1, Number(day));
    if (Number.isNaN(local.getTime())) return null;
    return local.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatFieldValue(value: unknown, type?: string): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (type === "currency") {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
    }
    return value.toLocaleString();
  }
  if (typeof value === "string" && (type === "date" || type === "datetime")) {
    const formatted = formatTemporal(value, type);
    if (formatted) return formatted;
  }
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export function recordLabel(record: Record<string, unknown>): string {
  if (record.firstName || record.lastName) {
    return [record.firstName, record.lastName].filter(Boolean).join(" ") || "Untitled";
  }
  // `number` before the uuid fallback: quotes and invoices carry no name, and
  // listing one as "da416ab3-410d-…" tells the reader nothing they can use.
  const name = record.name ?? record.title ?? record.label ?? record.number ?? record.subject ?? record.id;
  return name ? String(name) : "this record";
}

export function recordTitle(record: Record<string, unknown>, label: string): string {
  return recordLabel(record) === "this record" || recordLabel(record) === "Untitled"
    ? `${label} ${String(record.id ?? "").slice(0, 8)}`
    : recordLabel(record);
}
