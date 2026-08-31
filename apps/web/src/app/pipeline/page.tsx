"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { GripVertical } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { RelationLabel } from "@/components/relation-field";
import { useToast } from "@/components/ui/toast";
import { usePageTitle } from "@/hooks/use-page-title";
import { api } from "@/lib/api";

const STAGES = [
  { key: "lead", label: "Lead", accent: "border-t-slate-400" },
  { key: "qualified", label: "Qualified", accent: "border-t-sky-500" },
  { key: "proposal", label: "Proposal", accent: "border-t-amber-500" },
  { key: "won", label: "Won", accent: "border-t-emerald-500" },
  { key: "lost", label: "Lost", accent: "border-t-rose-500" },
] as const;

interface DealCard {
  id: string;
  title: string;
  value: number | null;
  stage: string;
  companyId: string | null;
  probability: number | null;
  expectedClose: string | null;
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default function PipelinePage() {
  const { toast } = useToast();
  const [deals, setDeals] = useState<DealCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  usePageTitle("Pipeline");

  const load = useCallback(async () => {
    try {
      const result = await api.list("deal", { pageSize: 200 });
      setDeals(
        result.data.map((d) => ({
          id: String(d.id),
          title: String(d.title ?? "Untitled"),
          value: typeof d.value === "number" ? d.value : d.value ? Number(d.value) : null,
          stage: String(d.stage ?? "lead"),
          companyId: (d.companyId as string) ?? null,
          probability: (d.probability as number) ?? null,
          expectedClose: (d.expectedClose as string) ?? null,
        })),
      );
    } catch (err) {
      toast({ title: "Failed to load pipeline", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const byStage = useMemo(() => {
    const map = new Map<string, DealCard[]>();
    for (const stage of STAGES) map.set(stage.key, []);
    for (const deal of deals) {
      (map.get(deal.stage) ?? map.get("lead"))!.push(deal);
    }
    return map;
  }, [deals]);

  async function moveDeal(dealId: string, stage: string) {
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage === stage) return;
    const previous = deal.stage;
    // Optimistic move; revert on failure
    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage } : d)));
    try {
      await api.update("deal", dealId, { stage });
      toast({ title: `Moved "${deal.title}" to ${stage}` });
    } catch (err) {
      setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage: previous } : d)));
      toast({ title: "Move failed", description: (err as Error).message, variant: "destructive" });
    }
  }

  return (
    <div className="flex h-full flex-col p-4 md:p-6">
      <div className="mb-4 flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">Pipeline</h1>
        <p className="text-sm text-muted-foreground">Drag deals between stages</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {STAGES.map((s) => (
            <Skeleton key={s.key} className="h-64" />
          ))}
        </div>
      ) : (
        /* min-h-0 is what pins the board: without it a stage with a long list
           grows the whole page instead of scrolling inside its column. */
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-x-auto sm:grid-cols-2 lg:grid-cols-5">
          {STAGES.map((stage) => {
            const stageDeals = byStage.get(stage.key) ?? [];
            const totalValue = stageDeals.reduce((acc, d) => acc + (d.value ?? 0), 0);
            return (
              <div
                key={stage.key}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverStage(stage.key);
                }}
                onDragLeave={() => setDragOverStage((s) => (s === stage.key ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverStage(null);
                  const id = e.dataTransfer.getData("text/deal-id");
                  if (id) moveDeal(id, stage.key);
                }}
                className={`flex min-h-[16rem] flex-col rounded-xl border border-border/80 border-t-2 bg-muted/20 ${stage.accent} ${
                  dragOverStage === stage.key ? "ring-2 ring-primary/50" : ""
                }`}
              >
                <div className="flex items-baseline justify-between px-3 py-2.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {stage.label}
                    <span className="ml-1.5 tabular-nums">{stageDeals.length}</span>
                  </span>
                  <span className="tabular-nums text-xs font-medium text-muted-foreground">
                    {currency.format(totalValue)}
                  </span>
                </div>
                <div className="scrollbar-thin lg:scroll-fade-b min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-2 pb-2">
                  {stageDeals.map((deal) => (
                    <div
                      key={deal.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/deal-id", deal.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDraggingId(deal.id);
                      }}
                      onDragEnd={() => setDraggingId(null)}
                      className={`group rounded-lg border border-border/80 bg-card p-3 shadow-sm transition-opacity ${
                        draggingId === deal.id ? "opacity-50" : ""
                      }`}
                    >
                      <div className="flex items-start gap-1.5">
                        <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/50" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/entities/deal/${deal.id}`}
                            className="block truncate text-sm font-medium hover:text-primary"
                          >
                            {deal.title}
                          </Link>
                          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span className="truncate">
                              {deal.companyId ? (
                                <RelationLabel entity="company" id={deal.companyId} link={false} />
                              ) : (
                                "—"
                              )}
                            </span>
                            {deal.value !== null && (
                              <span className="shrink-0 tabular-nums font-medium text-foreground">
                                {currency.format(deal.value)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {stageDeals.length === 0 && (
                    <p className="px-2 py-6 text-center text-xs text-muted-foreground">Drop deals here</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
