"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
              <p className="text-sm break-words whitespace-pre-wrap">{formatFieldValue(formData[field.name], field.type)}</p>
            </div>
          ) : (
            <>
              <Label htmlFor={field.name}>{field.label}</Label>
              {field.type === "json" ? (
                <textarea
                  id={field.name}
                  name={field.name}
                  className="mt-1.5 flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder='JSON, e.g. [{"field": "stage", "op": "eq", "value": "won"}]…'
                  value={(formData[field.name] as string) ?? (typeof formData[field.name] === "object" ? JSON.stringify(formData[field.name], null, 2) : "")}
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
                  onChange={(e) =>
                    onChange({
                      ...formData,
                      [field.name]:
                        field.type === "number" || field.type === "currency"
                          ? Number(e.target.value)
                          : e.target.value,
                    })
                  }
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
