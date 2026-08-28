"use client";

import { useState } from "react";
import { Check, Copy, Braces } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EntityField } from "@/lib/entity-ui";
import { cn } from "@/lib/utils";

/**
 * What a record actually is.
 *
 * The rest of the detail page shows a record the way a salesperson reads it.
 * This shows it the way it is stored: the real column names, their types, the
 * full id rather than the eight characters that fit in a heading, and the
 * import provenance that answers "where did this row come from".
 *
 * Everything here is already in the browser — it is the same schema and record
 * the page rendered from. Nothing new is fetched and nothing new is permitted;
 * this is a lens over data the user could already see.
 */

/** Fields every entity carries, which the form config deliberately hides. */
const SYSTEM_FIELDS = [
  "id",
  "tenantId",
  "externalId",
  "sourceSystem",
  "createdAt",
  "updatedAt",
] as const;

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard is blocked outside a secure context. The value is on
          // screen and selectable, so there is nothing to recover from.
        }
      }}
      className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground touch-manipulation"
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
    </button>
  );
}

function Row({ name, value }: { name: string; value: unknown }) {
  const text =
    value === null || value === undefined
      ? "null"
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return (
    <div className="flex items-start gap-2 border-b border-border/50 py-1.5 last:border-0">
      <code className="w-[9rem] shrink-0 text-[11px] text-muted-foreground">{name}</code>
      <code
        className={cn(
          "min-w-0 flex-1 break-all text-[11px]",
          value === null || value === undefined ? "text-muted-foreground/60" : "text-foreground",
        )}
      >
        {text}
      </code>
      {typeof value === "string" && value.length > 0 && <CopyButton value={value} label={name} />}
    </div>
  );
}

export function DevInspector({
  entity,
  record,
  fields,
  className,
}: {
  entity: string;
  record: Record<string, unknown>;
  fields: EntityField[];
  className?: string;
}) {
  const [tab, setTab] = useState<"identity" | "fields" | "json">("identity");

  const tabs = [
    { id: "identity", label: "Identity" },
    { id: "fields", label: `Fields (${fields.length})` },
    { id: "json", label: "JSON" },
  ] as const;

  return (
    <Card className={cn("border-dashed border-primary/40 shadow-layered", className)}>
      <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border/60 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Braces className="h-4 w-4" aria-hidden="true" />
          Inspector
        </CardTitle>
        <code className="text-[11px] text-muted-foreground">{entity}</code>
      </CardHeader>

      <div className="flex gap-1 border-b border-border/60 px-4 pt-3" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors touch-manipulation",
              tab === t.id
                ? "border-b-2 border-primary text-foreground"
                : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <CardContent className="pt-4">
        {tab === "identity" && (
          <div>
            {SYSTEM_FIELDS.map((name) => (
              <Row key={name} name={name} value={record[name]} />
            ))}
            {!record.externalId && (
              <p className="mt-3 text-xs text-muted-foreground">
                No <code className="text-[11px]">externalId</code> — this record was created in
                Meridian rather than imported.
              </p>
            )}
          </div>
        )}

        {tab === "fields" && (
          <div>
            {fields.map((field) => (
              <div
                key={field.name}
                className="flex items-start gap-2 border-b border-border/50 py-1.5 last:border-0"
              >
                <code className="w-[9rem] shrink-0 text-[11px] text-foreground">{field.name}</code>
                <span className="w-[5rem] shrink-0 text-[11px] text-muted-foreground">
                  {field.type}
                  {field.required && <span className="text-destructive"> *</span>}
                </span>
                <span className="min-w-0 flex-1 text-[11px] text-muted-foreground">
                  {field.relation ? (
                    <>
                      → <code className="text-[11px]">{field.relation}</code>
                    </>
                  ) : field.options ? (
                    field.options.join(" | ")
                  ) : (
                    field.label
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === "json" && (
          <div className="relative">
            <div className="absolute right-0 top-0">
              <CopyButton value={JSON.stringify(record, null, 2)} label="record JSON" />
            </div>
            <pre className="max-h-[28rem] overflow-auto rounded-md bg-muted/40 p-3 text-[11px] leading-relaxed">
              {JSON.stringify(record, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
