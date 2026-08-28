"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileWarning,
  Receipt,
  Target,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { AttentionItem, AttentionKind } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * The work queue.
 *
 * This is the answer to "what do I need to do today", which is the question
 * someone opens an ERP with — and the one a page of row counts never answered.
 * Every row links straight to the record, so reading the list and working it
 * are the same action.
 *
 * Severity rides on the icon's colour plus a written label. The label stays in
 * muted ink rather than the status hue — the warning step is sub-3:1 on a light
 * surface, so tinted micro-text would be unreadable in light mode, and the word
 * carries the meaning anyway.
 */

const KIND_META: Record<AttentionKind, { icon: LucideIcon; label: string }> = {
  invoice_overdue: { icon: Receipt, label: "Unpaid" },
  quote_expiring: { icon: FileWarning, label: "Expiring" },
  deal_stalled: { icon: AlertTriangle, label: "Stalled" },
  deal_closing: { icon: Target, label: "Closing" },
  activity_overdue: { icon: Clock, label: "Overdue" },
  task_overdue: { icon: CheckCircle2, label: "Overdue" },
};

const SEVERITY_COLOR = {
  critical: "var(--viz-critical)",
  warning: "var(--viz-warning)",
  info: undefined,
} as const;

function detailHref(item: AttentionItem): string {
  return `/entities/${item.entity}/${item.recordId}`;
}

export function AttentionQueue({
  items,
  loading,
  className,
}: {
  items: AttentionItem[];
  loading?: boolean;
  className?: string;
}) {
  if (loading) {
    return (
      <div className={cn("space-y-2", className)}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-lg border border-dashed border-border/80 px-6 py-12 text-center",
          className,
        )}
      >
        <TrendingUp className="h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
        <p className="mt-3 font-medium">Nothing needs you right now</p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          No overdue invoices, lapsing quotes, or late work. Anything that slips will show up here.
        </p>
      </div>
    );
  }

  return (
    <ul className={cn("space-y-1.5", className)}>
      {items.map((item) => {
        const meta = KIND_META[item.kind];
        const color = SEVERITY_COLOR[item.severity];
        return (
          <li key={`${item.kind}-${item.recordId}`}>
            <Link
              href={detailHref(item)}
              className="group flex items-center gap-3 rounded-lg border border-border/70 bg-card/40 px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-muted/30 touch-manipulation"
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/60"
                style={color ? { color } : undefined}
                aria-hidden="true"
              >
                <meta.icon className="h-4 w-4" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate font-medium">{item.title}</span>
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {meta.label}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground tabular-nums">
                  {item.detail}
                </span>
              </span>

              <CalendarClock
                className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary"
                aria-hidden="true"
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
