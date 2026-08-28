"use client";

import Link from "next/link";
import {
  CalendarCheck,
  CheckSquare,
  Mail,
  NotebookPen,
  Phone,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { ScheduleItem } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * The day, in clock order.
 *
 * The queue beside this one answers "what is late". That left a real gap: a
 * call booked for 3pm was invisible at 9am and only surfaced at 3:01pm, as a
 * failure. This is the other half — what you have actually committed to today,
 * read top to bottom the way a day runs.
 *
 * Elapsed items stay on the list rather than disappearing. A meeting that has
 * come and gone is still the thing you might need to write up, and silently
 * dropping it would make the panel lie about what your day contained.
 */

const ACTIVITY_ICON: Record<string, LucideIcon> = {
  call: Phone,
  email: Mail,
  meeting: Users,
  note: NotebookPen,
  task: CheckSquare,
};

/** Clock time in the reader's own locale, or a dash for the untimed. */
function clock(at: string | null): string {
  if (!at) return "—";
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Where the icon column centres — see the rail comment below. */
const RAIL_LEFT = "calc(0.5rem + 3.5rem + 0.75rem + 0.75rem)";

function iconFor(item: ScheduleItem): LucideIcon {
  if (item.kind === "task") return CheckSquare;
  return ACTIVITY_ICON[item.detail] ?? CalendarCheck;
}

export function TodaySchedule({
  items,
  loading,
  className,
}: {
  items: ScheduleItem[];
  loading?: boolean;
  className?: string;
}) {
  if (loading) {
    return (
      <div className={cn("space-y-2", className)}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className={cn("py-6 text-center text-sm text-muted-foreground", className)}>
        Nothing scheduled today.
      </p>
    );
  }

  return (
    <ul className={cn("relative space-y-0.5", className)}>
      {/*
        One continuous rail rather than a segment per row. Rows are not all the
        same height once titles wrap to two lines, so per-row segments left
        visible gaps in the line. RAIL_LEFT is where the icon column centres:
        px-2 padding + the time column + gap-3 + half an icon.
      */}
      <span
        className="pointer-events-none absolute bottom-3 top-3 w-px -translate-x-1/2 bg-border/70"
        style={{ left: RAIL_LEFT }}
        aria-hidden="true"
      />
      {items.map((item) => {
        const Icon = iconFor(item);
        return (
          <li key={`${item.kind}-${item.recordId}`}>
            <Link
              href={`/entities/${item.entity}/${item.recordId}`}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/40 touch-manipulation",
                // Elapsed, not gone: legible, but visibly behind you.
                item.past && "opacity-55",
              )}
            >
              <span className="w-[3.5rem] shrink-0 self-start pt-0.5 text-right text-[11px] font-medium tabular-nums text-muted-foreground">
                {clock(item.at)}
              </span>

              {/* Sits on the rail, opaque, so the line reads as passing behind it. */}
              <span
                className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center self-start rounded-full bg-card ring-1 ring-border/70"
                aria-hidden="true"
              >
                <Icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
              </span>

              <span className="min-w-0 flex-1">
                {/* Wrapped, not truncated: this column is narrow, and every
                    subject here was ending in an ellipsis, which is the same as
                    not showing it. */}
                <span className="block text-sm font-medium leading-snug line-clamp-2">
                  {item.title}
                </span>
                <span className="block truncate text-xs text-muted-foreground first-letter:uppercase">
                  {item.detail}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
