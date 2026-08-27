"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Sparkles, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AutomationBuilder, EMPTY_RULE, ruleSentence, type Rule } from "@/components/automation-builder";
import { useToast } from "@/components/ui/toast";
import { usePageTitle } from "@/hooks/use-page-title";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface EntityMeta {
  name: string;
  label: string;
  pluralLabel: string;
}

export default function AutomationsPage() {
  usePageTitle("Automations");
  const { toast } = useToast();

  const [rules, setRules] = useState<Rule[]>([]);
  const [entities, setEntities] = useState<EntityMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderInitial, setBuilderInitial] = useState<Rule>(EMPTY_RULE);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiDrafting, setAiDrafting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Rule | null>(null);

  const entityLabels = Object.fromEntries(entities.map((e) => [e.name, e.label]));

  const load = useCallback(async () => {
    try {
      const [rulesResult, entitiesResult] = await Promise.all([
        api.list("automation", { pageSize: 100, sortBy: "createdAt", sortOrder: "asc" }),
        api.getEntities(),
      ]);
      setEntities(entitiesResult.entities);
      setRules(
        rulesResult.data.map((r) => ({
          id: String(r.id),
          name: String(r.name ?? "Untitled"),
          entity: String(r.entity ?? ""),
          event: (r.event as Rule["event"]) ?? "updated",
          conditions: Array.isArray(r.conditions) ? (r.conditions as Rule["conditions"]) : [],
          actions: Array.isArray(r.actions) ? (r.actions as Rule["actions"]) : [],
          enabled: Boolean(r.enabled),
        })),
      );
    } catch (err) {
      toast({ title: "Failed to load automations", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  function openNew() {
    setBuilderInitial({ ...EMPTY_RULE });
    setBuilderOpen(true);
  }

  function openEdit(rule: Rule) {
    setBuilderInitial(rule);
    setBuilderOpen(true);
  }

  async function handleAiDraft(e: React.FormEvent) {
    e.preventDefault();
    if (!aiPrompt.trim() || aiDrafting) return;
    setAiDrafting(true);
    try {
      const draft = await api.draftAutomation(aiPrompt.trim());
      setBuilderInitial({
        name: draft.name,
        entity: draft.entity,
        event: draft.event,
        conditions: draft.conditions as Rule["conditions"],
        actions: draft.actions as Rule["actions"],
        enabled: true,
      });
      setBuilderOpen(true);
      setAiPrompt("");
    } catch (err) {
      toast({ title: "Couldn't draft that", description: (err as Error).message, variant: "destructive" });
    } finally {
      setAiDrafting(false);
    }
  }

  async function toggleEnabled(rule: Rule) {
    // Optimistic flip; revert on failure
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)));
    try {
      await api.update("automation", rule.id!, { enabled: !rule.enabled });
    } catch (err) {
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: rule.enabled } : r)));
      toast({ title: "Could not update", description: (err as Error).message, variant: "destructive" });
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete("automation", deleteTarget.id!);
      setDeleteTarget(null);
      toast({ title: `"${deleteTarget.name}" deleted` });
      load();
    } catch (err) {
      toast({ title: "Delete failed", description: (err as Error).message, variant: "destructive" });
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Automations</h1>
          <p className="text-sm text-muted-foreground">
            Rules that run your business while you sleep
          </p>
        </div>
        <Button onClick={openNew} className="touch-manipulation">
          <Plus className="mr-1 h-4 w-4" /> New automation
        </Button>
      </div>

      {/* AI lane — describe it, refine visually */}
      <form onSubmit={handleAiDraft} className="mb-8">
        <div className="flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 p-2 shadow-sm focus-within:ring-2 focus-within:ring-primary/40">
          <Sparkles className="ml-2 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <input
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder='Describe it… "When a deal over $50k is won, create a kickoff project and notify the team"'
            className="h-9 flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
            aria-label="Describe an automation in plain English"
          />
          <Button type="submit" size="sm" disabled={aiDrafting || !aiPrompt.trim()} className="shrink-0">
            {aiDrafting ? "Drafting…" : "Draft it"}
          </Button>
        </div>
        <p className="mt-1.5 pl-2 text-xs text-muted-foreground">
          AI writes the rule, you review and tweak it visually before it goes live.
        </p>
      </form>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : rules.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <Zap className="mx-auto mb-3 h-8 w-8 text-primary/50" aria-hidden="true" />
            <p className="mb-1 font-medium">No automations yet</p>
            <p className="mb-4 text-sm text-muted-foreground">
              Describe one above in plain English, or build one by hand.
            </p>
            <Button onClick={openNew}>
              <Plus className="mr-1 h-4 w-4" /> Build your first automation
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {rules.map((rule) => (
            <li key={rule.id}>
              <Card className={cn("transition-opacity", !rule.enabled && "opacity-60")}>
                <CardContent className="flex items-start gap-4 p-4">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={rule.enabled}
                    aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.name}`}
                    onClick={() => toggleEnabled(rule)}
                    className={cn(
                      "relative mt-1 h-5 w-9 shrink-0 rounded-full transition-colors",
                      rule.enabled ? "bg-primary" : "bg-muted-foreground/30",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                        rule.enabled ? "translate-x-4" : "translate-x-0.5",
                      )}
                    />
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{rule.name}</span>
                      <Badge variant="secondary" className="font-normal capitalize">
                        {entityLabels[rule.entity] ?? rule.entity}
                      </Badge>
                      {!rule.enabled && (
                        <Badge variant="outline" className="font-normal">
                          Paused
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{ruleSentence(rule, entityLabels)}</p>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(rule)} aria-label={`Edit ${rule.name}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(rule)} aria-label={`Delete ${rule.name}`}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <AutomationBuilder
        open={builderOpen}
        initial={builderInitial}
        entities={entities.filter((e) => e.name !== "comment")}
        onClose={() => setBuilderOpen(false)}
        onSaved={load}
      />

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{deleteTarget?.name}"?</DialogTitle>
            <DialogDescription>The rule stops immediately. Records it already created are kept.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
