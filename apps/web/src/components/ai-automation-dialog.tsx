"use client";

import { useState } from "react";
import { Sparkles, Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { api, type AutomationDraft } from "@/lib/api";

/** "Create with AI": English description → previewed rule → saved automation. */
export function AiAutomationDialog({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState<AutomationDraft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);

  function reset() {
    setPrompt("");
    setDraft(null);
  }

  async function handleDraft(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setDrafting(true);
    try {
      setDraft(await api.draftAutomation(prompt.trim()));
    } catch (err) {
      toast({ title: "Could not draft rule", description: (err as Error).message, variant: "destructive" });
    } finally {
      setDrafting(false);
    }
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    try {
      await api.create("automation", {
        name: draft.name,
        entity: draft.entity,
        event: draft.event,
        conditions: draft.conditions,
        actions: draft.actions,
        enabled: true,
      });
      toast({ title: `Automation "${draft.name}" created` });
      setOpen(false);
      reset();
      onCreated();
    } catch (err) {
      toast({ title: "Save failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="touch-manipulation">
        <Sparkles className="mr-1 h-4 w-4 text-primary" /> Create with AI
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Describe your automation
            </DialogTitle>
            <DialogDescription>
              Say what should happen in plain English — Meridian writes the rule and shows it to you before saving.
            </DialogDescription>
          </DialogHeader>

          {!draft ? (
            <form onSubmit={handleDraft} className="space-y-4">
              <div>
                <Label htmlFor="ai-rule-prompt" className="sr-only">Rule description</Label>
                <textarea
                  id="ai-rule-prompt"
                  autoFocus
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder='e.g. "When a deal over $50,000 moves to proposal, create a review task for the delivery team"'
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={drafting || !prompt.trim()}>
                  {drafting ? "Drafting…" : "Draft rule"}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <p className="text-sm font-medium">{draft.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{draft.summary}</p>
              </div>
              <details className="rounded-lg border border-border/80">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">
                  Rule JSON
                </summary>
                <pre className="overflow-x-auto border-t border-border/80 p-3 font-mono text-xs">
                  {JSON.stringify(
                    { entity: draft.entity, event: draft.event, conditions: draft.conditions, actions: draft.actions },
                    null,
                    2,
                  )}
                </pre>
              </details>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setDraft(null)}>
                  <RotateCcw className="mr-1 h-4 w-4" /> Rewrite
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  <Check className="mr-1 h-4 w-4" /> {saving ? "Saving…" : "Save automation"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
