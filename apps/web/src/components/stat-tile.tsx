import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A headline number.
 *
 * The dashboard used to spend this space on row counts — "26 contacts" — which
 * is inventory, not a figure anyone steers by. A tile earns its place only if
 * the number changes what someone does next, so each one carries a caption
 * saying what it means rather than just what it counts.
 */
export function StatTile({
  label,
  value,
  caption,
  icon: Icon,
  tone = "neutral",
  hero,
  className,
}: {
  label: string;
  value: string;
  caption?: string;
  icon?: LucideIcon;
  /**
   * Tints the icon only. The value itself stays in normal ink: the warning
   * step is sub-3:1 on a light surface, so a big number painted with it is
   * unreadable in light mode — and a figure is text, which wears text colour.
   * The icon is the mark that carries the status, and the caption says it in
   * words, so the meaning never rests on colour alone.
   */
  tone?: "neutral" | "good" | "warning" | "critical";
  /** The one number the page leads with, set larger than the rest. */
  hero?: boolean;
  className?: string;
}) {
  const toneColor = {
    neutral: undefined,
    good: "var(--viz-good)",
    warning: "var(--viz-warning)",
    critical: "var(--viz-critical)",
  }[tone];

  return (
    <div
      className={cn(
        "glass-card flex flex-col rounded-xl p-4 shadow-layered",
        hero && "sm:p-5",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {Icon && (
          <Icon
            className="h-4 w-4 shrink-0"
            style={toneColor ? { color: toneColor } : undefined}
            aria-hidden="true"
          />
        )}
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
      </div>
      <p
        className={cn(
          "mt-2 font-bold tabular-nums tracking-tight",
          hero ? "text-3xl sm:text-4xl" : "text-2xl",
        )}
      >
        {value}
      </p>
      {caption && <p className="mt-1 text-xs text-muted-foreground">{caption}</p>}
    </div>
  );
}
