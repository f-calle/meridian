"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";

export interface StackedDatum {
  label: string;
  onTrack: number;
  pastDue: number;
}

/**
 * Two-part bar: the healthy share and the part that has slipped.
 *
 * Part-to-whole with two parts, so a stacked bar rather than two charts. The
 * slipped part wears the reserved warning colour, which means it also carries
 * an icon and a written label in the legend — a status colour never carries
 * meaning on its own.
 */
export function StackedBar({
  data,
  format,
  emptyLabel = "No data yet",
}: {
  data: StackedDatum[];
  format: (value: number) => string;
  emptyLabel?: string;
}) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  const max = Math.max(...data.map((d) => d.onTrack + d.pastDue), 1);

  return (
    <div className="space-y-4">
      <ul className="space-y-2.5">
        {data.map((d) => {
          const total = d.onTrack + d.pastDue;
          return (
            <li key={d.label} className="grid grid-cols-[6rem_1fr_auto] items-center gap-3">
              <span className="truncate text-sm capitalize text-muted-foreground">{d.label}</span>
              <span className="relative flex h-5 overflow-hidden rounded-sm bg-muted/50">
                <span
                  className="h-full transition-[width] duration-500"
                  style={{
                    width: `${(d.onTrack / max) * 100}%`,
                    background: "var(--viz-series-1)",
                  }}
                  title={`On track: ${format(d.onTrack)}`}
                />
                {d.pastDue > 0 && (
                  <span
                    // A 2px gap so the two segments read as separate parts
                    // rather than one bar with a colour change.
                    className="h-full border-l-2 border-card transition-[width] duration-500"
                    style={{
                      width: `${(d.pastDue / max) * 100}%`,
                      background: "var(--viz-warning)",
                    }}
                    title={`Past due: ${format(d.pastDue)}`}
                  />
                )}
              </span>
              <span className="tabular-nums text-sm font-medium">{format(total)}</span>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap gap-4 border-t border-border/70 pt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "var(--viz-series-1)" }} aria-hidden="true" />
          On track
        </span>
        <span className="flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" style={{ color: "var(--viz-warning)" }} aria-hidden="true" />
          Close date passed
        </span>
      </div>
    </div>
  );
}
