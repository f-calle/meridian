import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import type { DashboardMetrics } from "@/lib/api";

/**
 * Pipeline by stage.
 *
 * Stage is ordered magnitude, not identity, so this is one hue with length
 * carrying the value — a categorical palette here would imply the stages are
 * unrelated kinds rather than steps of one funnel. Stages stay in pipeline
 * order for the same reason; sorted by size it stops being a funnel.
 *
 * Closed stages sit below a rule, because "won" is an outcome rather than a
 * step, and are marked with an icon and a word so the distinction does not rest
 * on colour.
 */

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const OPEN_STAGES = new Set(["lead", "qualified", "proposal"]);

export function PipelineFunnel({ pipeline }: { pipeline: DashboardMetrics["pipeline"] }) {
  if (pipeline.length === 0) {
    return <p className="text-sm text-muted-foreground">No deals yet.</p>;
  }

  const open = pipeline.filter((s) => OPEN_STAGES.has(s.stage));
  const closed = pipeline.filter((s) => !OPEN_STAGES.has(s.stage));
  // Scale against the largest stage in play so the open funnel uses the full
  // width; a won stage dwarfing the rest would otherwise flatten it.
  const scale = Math.max(...open.map((s) => s.value), 1);
  const openValue = open.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {open.map((stage) => {
          const width = Math.max(3, Math.round((stage.value / scale) * 100));
          // Share of open value, not conversion from the stage above. These
          // counts are a snapshot of where deals sit right now, not a cohort
          // moving through, so "80% carried through" would be a claim the data
          // cannot support — the deals in `proposal` are not the survivors of
          // the ones in `lead`.
          const share = openValue > 0 ? Math.round((stage.value / openValue) * 100) : 0;

          return (
            <div key={stage.stage}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                <span className="flex items-baseline gap-2">
                  <span className="capitalize">{stage.stage}</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {share}% of open value
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {stage.count} · {currency.format(stage.value)}
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
                  style={{ width: `${width}%`, background: "var(--viz-series-1)" }}
                  title={`${stage.count} deals worth ${currency.format(stage.value)}`}
                  role="presentation"
                />
              </div>
            </div>
          );
        })}
      </div>

      {closed.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border/70 pt-3 text-sm">
          {closed.map((stage) => {
            const isWon = stage.stage === "won";
            const Icon = isWon ? CheckCircle2 : XCircle;
            return (
              <span key={stage.stage} className="flex items-center gap-1.5">
                <Icon
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: isWon ? "var(--viz-good)" : undefined }}
                  aria-hidden="true"
                />
                <span className="capitalize text-muted-foreground">{stage.stage}</span>
                <span className="tabular-nums">
                  {stage.count} · {currency.format(stage.value)}
                </span>
              </span>
            );
          })}
        </div>
      )}

      <Link
        href="/pipeline"
        className="inline-block text-sm text-primary hover:underline touch-manipulation"
      >
        Open the board →
      </Link>
    </div>
  );
}
