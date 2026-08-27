"use client";

import { useId, useState } from "react";

export interface BarDatum {
  label: string;
  value: number;
  count?: number;
  /** Optional explicit color (e.g. status colors); defaults to the series hue */
  color?: string;
}

/**
 * Horizontal bar chart for a single measure. One series, so no legend —
 * the title names it — with direct value labels on every bar, a recessive
 * baseline, and a hover tooltip carrying the record count.
 */
export function BarChart({
  data,
  format,
  emptyLabel = "No data yet",
}: {
  data: BarDatum[];
  format: (value: number) => string;
  emptyLabel?: string;
}) {
  const titleId = useId();
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 0);

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-2.5" aria-describedby={titleId}>
      {data.map((d, i) => {
        const pct = max > 0 ? Math.max((d.value / max) * 100, d.value > 0 ? 1.5 : 0) : 0;
        return (
          <li
            key={d.label}
            className="relative grid grid-cols-[8rem_1fr_auto] items-center gap-3"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(i)}
            onBlur={() => setHovered(null)}
            tabIndex={0}
          >
            <span className="truncate text-sm capitalize text-muted-foreground" title={d.label}>
              {d.label}
            </span>
            <span className="relative h-5 overflow-hidden rounded-sm bg-muted/50">
              <span
                className="absolute inset-y-0 left-0 rounded-sm transition-[width] duration-500"
                style={{
                  width: `${pct}%`,
                  backgroundColor: d.color ?? "var(--viz-series-1)",
                }}
              />
            </span>
            <span className="tabular-nums text-sm font-medium">{format(d.value)}</span>

            {hovered === i && d.count !== undefined && (
              <span
                role="status"
                className="pointer-events-none absolute -top-7 left-32 z-10 rounded-md border border-border bg-popover px-2 py-1 text-xs shadow-md"
              >
                {d.count} {d.count === 1 ? "record" : "records"} · {format(d.value)}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
