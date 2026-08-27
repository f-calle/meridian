import type { EntityField } from "@/lib/entity-ui";

/** RFC-4180 escaping: quote when the value contains a comma, quote, or newline. */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

export function toCsv(records: Record<string, unknown>[], fields: EntityField[]): string {
  const columns = ["id", ...fields.map((f) => f.name)];
  const header = ["ID", ...fields.map((f) => f.label)].map(escapeCell).join(",");
  const rows = records.map((r) => columns.map((c) => escapeCell(r[c])).join(","));
  return [header, ...rows].join("\n");
}

/** Trigger a browser download of `content` as `filename`. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([`﻿${content}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
