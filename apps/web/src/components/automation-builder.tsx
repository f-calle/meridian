"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Zap, Globe, PenLine, FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { EntityField } from "@/lib/entity-ui";

// ── Rule model ────────────────────────────────────────────────

export interface RuleCondition {
  field: string;
  op: string;
  value?: string | number | boolean;
}

export type RuleAction =
  | { type: "set_field"; field: string; value: string | number | boolean }
  | { type: "create_record"; entity: string; data: Record<string, string | number | boolean> }
  | { type: "webhook"; url: string };

export interface Rule {
  id?: string;
  name: string;
  entity: string;
  event: "created" | "updated" | "deleted";
  conditions: RuleCondition[];
  actions: RuleAction[];
  enabled: boolean;
}

export const EMPTY_RULE: Rule = {
  name: "",
  entity: "deal",
  event: "updated",
  conditions: [],
  actions: [],
  enabled: true,
};

const OPS: { value: string; label: string; needsValue: boolean }[] = [
  { value: "eq", label: "equals", needsValue: true },
  { value: "neq", label: "doesn't equal", needsValue: true },
  { value: "gt", label: "is more than", needsValue: true },
  { value: "gte", label: "is at least", needsValue: true },
  { value: "lt", label: "is less than", needsValue: true },
  { value: "lte", label: "is at most", needsValue: true },
  { value: "contains", label: "contains", needsValue: true },
  { value: "is_set", label: "has a value", needsValue: false },
  { value: "not_set", label: "is empty", needsValue: false },
];

const EVENTS: { value: Rule["event"]; label: string; hint: string }[] = [
  { value: "created", label: "created", hint: "Fires when a new record is added" },
  { value: "updated", label: "updated", hint: "Fires when a condition field changes to match" },
  { value: "deleted", label: "deleted", hint: "Fires when a record is removed" },
];

// ── Human-readable sentence ───────────────────────────────────

export function ruleSentence(
  rule: Rule,
  entityLabels: Record<string, string>,
  fieldLabels?: Record<string, string>,
): string {
  const label = (name: string) => entityLabels[name] ?? name;
  const fLabel = (name: string) => fieldLabels?.[name] ?? name;
  const opLabel = (op: string) => OPS.find((o) => o.value === op)?.label ?? op;

  const when = `When a ${label(rule.entity)} is ${rule.event}`;
  const conds =
    rule.conditions.length === 0
      ? ""
      : " and " +
        rule.conditions
          .map((c) =>
            OPS.find((o) => o.value === c.op)?.needsValue === false
              ? `${fLabel(c.field)} ${opLabel(c.op)}`
              : `${fLabel(c.field)} ${opLabel(c.op)} ${String(c.value ?? "")}`,
          )
          .join(" and ");
  const acts =
    rule.actions.length === 0
      ? "do nothing yet"
      : rule.actions
          .map((a) =>
            a.type === "set_field"
              ? `set ${fLabel(a.field)} to ${String(a.value)}`
              : a.type === "create_record"
                ? `create a ${label(a.entity)}`
                : "call a webhook",
          )
          .join(", then ");
  return `${when}${conds} → ${acts}.`;
}

// ── Field-typed value input ───────────────────────────────────

function ValueInput({
  field,
  value,
  onChange,
  variables,
  placeholder,
  ariaLabel,
}: {
  field?: EntityField;
  value: string | number | boolean | undefined;
  onChange: (v: string | number | boolean) => void;
  variables?: string[];
  placeholder?: string;
  ariaLabel: string;
}) {
  if (field?.type === "select" && field.options?.length) {
    return (
      <select
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 min-w-32 rounded-md border border-input bg-background px-2 text-sm"
        aria-label={ariaLabel}
      >
        <option value="">Choose…</option>
        {field.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (field?.type === "boolean") {
    return (
      <select
        value={String(value ?? "true")}
        onChange={(e) => onChange(e.target.value === "true")}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        aria-label={ariaLabel}
      >
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }
  const isNumber = field?.type === "number" || field?.type === "currency";
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Input
        type={isNumber ? "number" : "text"}
        value={String(value ?? "")}
        onChange={(e) => onChange(isNumber ? Number(e.target.value) : e.target.value)}
        placeholder={placeholder ?? "Value"}
        className="h-9 min-w-24 flex-1 text-sm"
        aria-label={ariaLabel}
      />
      {variables && variables.length > 0 && !isNumber && (
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) onChange(`${String(value ?? "")}{{${e.target.value}}}`);
          }}
          className="h-9 w-11 shrink-0 rounded-md border border-input bg-background text-center text-xs text-muted-foreground"
          aria-label={`Insert variable into ${ariaLabel}`}
          title="Insert a value from the triggering record"
        >
          <option value="">{"{}"}</option>
          {variables.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// ── The builder sheet ─────────────────────────────────────────

export function AutomationBuilder({
  open,
  initial,
  entities,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: Rule;
  entities: { name: string; label: string; pluralLabel: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [rule, setRule] = useState<Rule>(initial);
  const [schemas, setSchemas] = useState<Record<string, EntityField[]>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRule(initial);
  }, [initial, open]);

  const loadSchema = useCallback(
    async (entityName: string) => {
      if (!entityName || schemas[entityName]) return;
      try {
        const schema = await api.getSchema(entityName);
        setSchemas((prev) => ({ ...prev, [entityName]: schema.fields as EntityField[] }));
      } catch {
        // field pickers degrade to free text
      }
    },
    [schemas],
  );

  useEffect(() => {
    if (!open) return;
    loadSchema(rule.entity);
    for (const action of rule.actions) {
      if (action.type === "create_record") loadSchema(action.entity);
    }
  }, [open, rule.entity, rule.actions, loadSchema]);

  const triggerFields = (schemas[rule.entity] ?? []).filter((f) => f.type !== "json");
  const triggerFieldNames = ["recordId", ...triggerFields.map((f) => f.name)];
  const entityLabels = Object.fromEntries(entities.map((e) => [e.name, e.label]));
  const fieldLabels = Object.fromEntries(triggerFields.map((f) => [f.name, f.label]));
  const fieldByName = Object.fromEntries(triggerFields.map((f) => [f.name, f]));

  const canSave = rule.name.trim() !== "" && rule.actions.length > 0;

  async function save() {
    setSaving(true);
    try {
      const payload = {
        name: rule.name.trim(),
        entity: rule.entity,
        event: rule.event,
        conditions: rule.conditions,
        actions: rule.actions,
        enabled: rule.enabled,
      };
      if (rule.id) await api.update("automation", rule.id, payload);
      else await api.create("automation", payload);
      toast({ title: rule.id ? "Automation updated" : "Automation created" });
      onSaved();
      onClose();
    } catch (err) {
      toast({ title: "Save failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const sectionTitle = "text-xs font-bold uppercase tracking-widest text-primary";

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto border-border/80 bg-card p-0 sm:max-w-xl">
        <SheetHeader className="shrink-0 border-b border-border/80 px-6 py-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-primary" />
            {rule.id ? "Edit automation" : "New automation"}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-7 px-6 py-5">
          <div>
            <Label htmlFor="rule-name">Name</Label>
            <Input
              id="rule-name"
              value={rule.name}
              onChange={(e) => setRule({ ...rule, name: e.target.value })}
              placeholder="e.g. Won deal → kickoff project"
              className="mt-1.5"
              autoFocus
            />
          </div>

          {/* WHEN */}
          <section>
            <p className={sectionTitle}>When</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">A</span>
              <select
                value={rule.entity}
                onChange={(e) => {
                  setRule({ ...rule, entity: e.target.value, conditions: [] });
                  loadSchema(e.target.value);
                }}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-medium"
                aria-label="Trigger entity"
              >
                {entities
                  .filter((e) => e.name !== "automation")
                  .map((e) => (
                    <option key={e.name} value={e.name}>
                      {e.label}
                    </option>
                  ))}
              </select>
              <span className="text-sm text-muted-foreground">is</span>
              <div className="inline-flex rounded-lg border border-border/80 bg-muted/30 p-0.5" role="radiogroup" aria-label="Trigger event">
                {EVENTS.map((ev) => (
                  <button
                    key={ev.value}
                    type="button"
                    role="radio"
                    aria-checked={rule.event === ev.value}
                    onClick={() => setRule({ ...rule, event: ev.value })}
                    className={cn(
                      "rounded-md px-3 py-1 text-sm transition-colors",
                      rule.event === ev.value
                        ? "bg-background font-medium text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {ev.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {EVENTS.find((e) => e.value === rule.event)?.hint}
            </p>
          </section>

          {/* IF */}
          <section>
            <div className="flex items-center justify-between">
              <p className={sectionTitle}>Only if</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setRule({
                    ...rule,
                    conditions: [...rule.conditions, { field: triggerFields[0]?.name ?? "", op: "eq", value: "" }],
                  })
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add condition
              </Button>
            </div>
            {rule.conditions.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">Runs every time — add a condition to narrow it down.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {rule.conditions.map((cond, i) => {
                  const op = OPS.find((o) => o.value === cond.op);
                  return (
                    <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/20 p-2">
                      <select
                        value={cond.field}
                        onChange={(e) =>
                          setRule({
                            ...rule,
                            conditions: rule.conditions.map((c, j) => (j === i ? { ...c, field: e.target.value, value: "" } : c)),
                          })
                        }
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                        aria-label={`Condition ${i + 1} field`}
                      >
                        {triggerFields.map((f) => (
                          <option key={f.name} value={f.name}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={cond.op}
                        onChange={(e) =>
                          setRule({
                            ...rule,
                            conditions: rule.conditions.map((c, j) => (j === i ? { ...c, op: e.target.value } : c)),
                          })
                        }
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                        aria-label={`Condition ${i + 1} operator`}
                      >
                        {OPS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      {op?.needsValue !== false && (
                        <ValueInput
                          field={fieldByName[cond.field]}
                          value={cond.value}
                          onChange={(v) =>
                            setRule({
                              ...rule,
                              conditions: rule.conditions.map((c, j) => (j === i ? { ...c, value: v } : c)),
                            })
                          }
                          ariaLabel={`Condition ${i + 1} value`}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => setRule({ ...rule, conditions: rule.conditions.filter((_, j) => j !== i) })}
                        className="ml-auto rounded p-1.5 text-muted-foreground hover:text-destructive"
                        aria-label={`Remove condition ${i + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* THEN */}
          <section>
            <div className="flex items-center justify-between">
              <p className={sectionTitle}>Then</p>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setRule({ ...rule, actions: [...rule.actions, { type: "set_field", field: triggerFields[0]?.name ?? "", value: "" }] })
                  }
                >
                  <PenLine className="mr-1 h-3.5 w-3.5" /> Update field
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const target = entities.find((e) => e.name !== rule.entity && e.name !== "automation")?.name ?? "activity";
                    loadSchema(target);
                    setRule({ ...rule, actions: [...rule.actions, { type: "create_record", entity: target, data: {} }] });
                  }}
                >
                  <FilePlus2 className="mr-1 h-3.5 w-3.5" /> Create record
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRule({ ...rule, actions: [...rule.actions, { type: "webhook", url: "" }] })}
                >
                  <Globe className="mr-1 h-3.5 w-3.5" /> Webhook
                </Button>
              </div>
            </div>

            {rule.actions.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">Add at least one action — that's what the automation does.</p>
            ) : (
              <ul className="mt-2 space-y-3">
                {rule.actions.map((action, i) => (
                  <li key={i} className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {action.type === "set_field" ? "Update a field" : action.type === "create_record" ? "Create a record" : "Call a webhook"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setRule({ ...rule, actions: rule.actions.filter((_, j) => j !== i) })}
                        className="rounded p-1 text-muted-foreground hover:text-destructive"
                        aria-label={`Remove action ${i + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {action.type === "set_field" && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-muted-foreground">Set</span>
                        <select
                          value={action.field}
                          onChange={(e) =>
                            setRule({
                              ...rule,
                              actions: rule.actions.map((a, j) => (j === i && a.type === "set_field" ? { ...a, field: e.target.value } : a)),
                            })
                          }
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                          aria-label={`Action ${i + 1} field`}
                        >
                          {triggerFields.map((f) => (
                            <option key={f.name} value={f.name}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                        <span className="text-sm text-muted-foreground">to</span>
                        <ValueInput
                          field={fieldByName[action.field]}
                          value={action.value}
                          onChange={(v) =>
                            setRule({
                              ...rule,
                              actions: rule.actions.map((a, j) => (j === i && a.type === "set_field" ? { ...a, value: v } : a)),
                            })
                          }
                          variables={triggerFieldNames}
                          ariaLabel={`Action ${i + 1} value`}
                        />
                      </div>
                    )}

                    {action.type === "create_record" && (
                      <CreateRecordAction
                        action={action}
                        entities={entities}
                        schemas={schemas}
                        loadSchema={loadSchema}
                        variables={triggerFieldNames}
                        onChange={(next) =>
                          setRule({ ...rule, actions: rule.actions.map((a, j) => (j === i ? next : a)) })
                        }
                      />
                    )}

                    {action.type === "webhook" && (
                      <Input
                        value={action.url}
                        onChange={(e) =>
                          setRule({
                            ...rule,
                            actions: rule.actions.map((a, j) => (j === i && a.type === "webhook" ? { ...a, url: e.target.value } : a)),
                          })
                        }
                        placeholder="https://example.com/hooks/meridian"
                        className="h-9 text-sm"
                        aria-label={`Action ${i + 1} webhook URL`}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Live preview + save */}
        <div className="shrink-0 space-y-3 border-t border-border/80 bg-muted/20 px-6 py-4">
          <p className="text-sm leading-relaxed">
            <Zap className="mr-1.5 inline h-3.5 w-3.5 text-primary" aria-hidden="true" />
            {ruleSentence(rule, entityLabels, fieldLabels)}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!canSave || saving}>
              {saving ? "Saving…" : rule.id ? "Save changes" : "Create automation"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Create-record action editor ───────────────────────────────

function CreateRecordAction({
  action,
  entities,
  schemas,
  loadSchema,
  variables,
  onChange,
}: {
  action: Extract<RuleAction, { type: "create_record" }>;
  entities: { name: string; label: string }[];
  schemas: Record<string, EntityField[]>;
  loadSchema: (entity: string) => void;
  variables: string[];
  onChange: (next: RuleAction) => void;
}) {
  const targetFields = (schemas[action.entity] ?? []).filter((f) => f.type !== "json" && f.type !== "relation");
  const fieldByName = Object.fromEntries(targetFields.map((f) => [f.name, f]));
  const usedFields = Object.keys(action.data);
  const availableFields = targetFields.filter((f) => !usedFields.includes(f.name));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Create a</span>
        <select
          value={action.entity}
          onChange={(e) => {
            loadSchema(e.target.value);
            onChange({ ...action, entity: e.target.value, data: {} });
          }}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm font-medium"
          aria-label="Record type to create"
        >
          {entities
            .filter((e) => e.name !== "automation")
            .map((e) => (
              <option key={e.name} value={e.name}>
                {e.label}
              </option>
            ))}
        </select>
        <span className="text-sm text-muted-foreground">with</span>
      </div>

      {usedFields.map((fieldName) => (
        <div key={fieldName} className="flex flex-wrap items-center gap-2 pl-2">
          <span className="min-w-24 text-sm">{fieldByName[fieldName]?.label ?? fieldName}</span>
          <ValueInput
            field={fieldByName[fieldName]}
            value={action.data[fieldName]}
            onChange={(v) => onChange({ ...action, data: { ...action.data, [fieldName]: v } })}
            variables={variables}
            ariaLabel={`${fieldName} value`}
          />
          <button
            type="button"
            onClick={() => {
              const next = { ...action.data };
              delete next[fieldName];
              onChange({ ...action, data: next });
            }}
            className="rounded p-1 text-muted-foreground hover:text-destructive"
            aria-label={`Remove ${fieldName}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {availableFields.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) onChange({ ...action, data: { ...action.data, [e.target.value]: "" } });
          }}
          className="h-8 rounded-md border border-dashed border-input bg-transparent px-2 text-xs text-muted-foreground"
          aria-label="Add a field to set"
        >
          <option value="">+ Set a field…</option>
          {availableFields.map((f) => (
            <option key={f.name} value={f.name}>
              {f.label}
              {f.required ? " (required)" : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
