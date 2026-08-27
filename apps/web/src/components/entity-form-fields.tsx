"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RelationLabel, RelationPicker } from "@/components/relation-field";
import { LineItemsEditor, LineItemsView } from "@/components/line-items-editor";
import { StatusBadge, isStatusValue } from "@/components/status-badge";
import type { EntityField } from "@/lib/entity-ui";
import { formatFieldValue } from "@/lib/entity-ui";

interface EntityFormFieldsProps {
  fields: EntityField[];
  formData: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
  mode?: "edit" | "view";
}

export function EntityFormFields({ fields, formData, onChange, mode = "edit" }: EntityFormFieldsProps) {
  return (
    <>
      {fields.map((field) => (
        <div
          key={field.name}
          className={field.type === "text" || field.type === "json" ? "md:col-span-2" : ""}
        >
          {mode === "view" ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{field.label}</p>
              {field.name === "lines" && field.type === "json" ? (
                <LineItemsView value={formData[field.name]} />
              ) : (
              <p className="text-sm break-words whitespace-pre-wrap">
                {field.type === "relation" && field.relation ? (
                  <RelationLabel entity={field.relation} id={formData[field.name] as string | null} />
                ) : field.type === "select" && isStatusValue(formData[field.name]) ? (
                  <StatusBadge value={String(formData[field.name])} />
                ) : (
                  formatFieldValue(formData[field.name], field.type)
                )}
              </p>
              )}
            </div>
          ) : (
            <>
              <Label htmlFor={field.name}>{field.label}</Label>
              {field.name === "lines" && field.type === "json" ? (
                <LineItemsEditor
                  value={formData[field.name]}
                  onChange={(lines, subtotal) => {
                    const tax = Number(formData.tax ?? 0) || 0;
                    onChange({ ...formData, lines, subtotal, total: Number((subtotal + tax).toFixed(2)) });
                  }}
                />
              ) : field.type === "relation" && field.relation ? (
                <RelationPicker
                  entity={field.relation}
                  value={(formData[field.name] as string) ?? null}
                  onChange={(recordId) => onChange({ ...formData, [field.name]: recordId })}
                  required={field.required}
                  id={field.name}
                />
              ) : field.type === "json" ? (
                <textarea
                  id={field.name}
                  name={field.name}
                  className="mt-1.5 flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder='JSON, e.g. [{"field": "stage", "op": "eq", "value": "won"}]…'
                  value={
                    typeof formData[field.name] === "string"
                      ? (formData[field.name] as string)
                      : formData[field.name] == null
                        ? ""
                        : JSON.stringify(formData[field.name], null, 2)
                  }
                  onChange={(e) => onChange({ ...formData, [field.name]: e.target.value })}
                />
              ) : field.type === "select" ? (
                <select
                  id={field.name}
                  name={field.name}
                  className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={(formData[field.name] as string) ?? ""}
                  onChange={(e) => onChange({ ...formData, [field.name]: e.target.value })}
                  required={field.required}
                >
                  <option value="">Select…</option>
                  {field.options?.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : field.type === "boolean" ? (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={field.name}
                    name={field.name}
                    checked={(formData[field.name] as boolean) ?? false}
                    onChange={(e) => onChange({ ...formData, [field.name]: e.target.checked })}
                    className="h-4 w-4 rounded border-input"
                  />
                  <Label htmlFor={field.name} className="font-normal text-muted-foreground">
                    Enable {field.label.toLowerCase()}
                  </Label>
                </div>
              ) : (
                <Input
                  id={field.name}
                  name={field.name}
                  className="mt-1.5"
                  type={
                    field.type === "number" || field.type === "currency"
                      ? "number"
                      : field.type === "date"
                        ? "date"
                        : field.type === "email"
                          ? "email"
                          : "text"
                  }
                  value={(formData[field.name] as string | number) ?? ""}
                  onChange={(e) => {
                    const isNumeric = field.type === "number" || field.type === "currency";
                    const value = isNumeric
                      ? e.target.value === ""
                        ? undefined
                        : Number(e.target.value)
                      : e.target.value;
                    const next = { ...formData, [field.name]: value };
                    // Keep the document total honest: editing tax or subtotal
                    // by hand must recompute it, not just editing lines.
                    if (field.name === "tax" || field.name === "subtotal") {
                      const subtotal = Number(next.subtotal ?? 0) || 0;
                      const tax = Number(next.tax ?? 0) || 0;
                      next.total = Number((subtotal + tax).toFixed(2));
                    }
                    onChange(next);
                  }}
                  required={field.required}
                />
              )}
            </>
          )}
        </div>
      ))}
    </>
  );
}
