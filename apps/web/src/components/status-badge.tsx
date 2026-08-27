"use client";

import { AlertTriangle, CheckCircle2, CircleDashed, Clock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "good" | "warning" | "critical" | "neutral" | "active";

/** Status → tone mapping across every entity that has a status-ish field. */
const TONES: Record<string, Tone> = {
  // deals
  won: "good",
  lost: "critical",
  lead: "neutral",
  qualified: "active",
  proposal: "active",
  // invoices & quotes
  paid: "good",
  accepted: "good",
  sent: "active",
  partial: "warning",
  overdue: "critical",
  declined: "critical",
  cancelled: "critical",
  expired: "warning",
  draft: "neutral",
  // projects & tasks
  active: "active",
  in_progress: "active",
  planning: "neutral",
  todo: "neutral",
  review: "warning",
  on_hold: "warning",
  done: "good",
  completed: "good",
  missed: "critical",
  pending: "neutral",
  // priorities
  urgent: "critical",
  high: "warning",
  medium: "neutral",
  low: "neutral",
};

const ICONS: Record<Tone, typeof CheckCircle2> = {
  good: CheckCircle2,
  warning: Clock,
  critical: AlertTriangle,
  active: CircleDashed,
  neutral: CircleDashed,
};

const CLASSES: Record<Tone, string> = {
  // Status colour never carries meaning alone — every badge ships icon + label.
  good: "border-[var(--viz-good)]/40 bg-[var(--viz-good)]/10 text-[var(--viz-good)]",
  warning: "border-[var(--viz-warning)]/40 bg-[var(--viz-warning)]/10 text-[var(--viz-warning)]",
  critical: "border-[var(--viz-critical)]/40 bg-[var(--viz-critical)]/10 text-[var(--viz-critical)]",
  active: "border-primary/40 bg-primary/10 text-primary",
  neutral: "border-border bg-muted/50 text-muted-foreground",
};

export function isStatusValue(value: unknown): boolean {
  return typeof value === "string" && value in TONES;
}

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  const tone = TONES[value] ?? "neutral";
  const Icon = ICONS[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
        CLASSES[tone],
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {value.replace(/_/g, " ")}
    </span>
  );
}
