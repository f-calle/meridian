"use client";

import { useEffect, useState } from "react";
import { History, Plus, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type AuditEntry } from "@/lib/api";
import { formatFieldValue } from "@/lib/entity-ui";
import { cn } from "@/lib/utils";

interface EntityAuditTimelineProps {
  entity: string;
  recordId: string;
  compact?: boolean;
}

const actionConfig = {
  create: { label: "Created", icon: Plus, className: "text-green-500" },
  update: { label: "Updated", icon: Pencil, className: "text-primary" },
  delete: { label: "Deleted", icon: Trash2, className: "text-destructive" },
} as const;

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDiff(diff: Record<string, unknown> | null, action: string): string[] {
  if (!diff || typeof diff !== "object") {
    return action === "delete" ? ["Record removed"] : [];
  }
  return Object.entries(diff).map(([key, value]) => {
    const formatted = formatFieldValue(value);
    return `${key}: ${formatted}`;
  });
}

export function EntityAuditTimeline({ entity, recordId, compact = false }: EntityAuditTimelineProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    api
      .auditLog(entity, recordId)
      .then((r) => setEntries(r.entries))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [entity, recordId]);

  return (
    <Card className={cn("glass-card rounded-xl shadow-layered", compact && "h-fit")}>
      <CardHeader className={cn("border-b border-border/80 bg-muted/20", compact && "pb-3")}>
        <CardTitle className="flex items-center gap-2 text-sm font-bold tracking-tight">
          <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Activity Timeline
        </CardTitle>
      </CardHeader>
      <CardContent className={cn("pt-4", compact && "max-h-[480px] overflow-y-auto overscroll-contain scrollbar-thin")}>
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: compact ? 2 : 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-muted-foreground">Activity history unavailable.</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
        ) : (
          <ol className="relative space-y-0 border-l border-border/80 pl-5">
            {entries.map((entry, index) => {
              const config = actionConfig[entry.action as keyof typeof actionConfig] ?? actionConfig.update;
              const Icon = config.icon;
              const changes = formatDiff(entry.diff, entry.action);

              return (
                <li key={entry.id} className={cn("relative pb-5", index === entries.length - 1 && "pb-0")}>
                  <span
                    className={cn(
                      "absolute -left-[1.65rem] flex h-6 w-6 items-center justify-center rounded-full border border-border/80 bg-card",
                      config.className,
                    )}
                  >
                    <Icon className="h-3 w-3" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium">
                      {config.label}{" "}
                      <span className="font-normal text-muted-foreground">
                        by {entry.actorType === "user" ? "user" : entry.actorType} {entry.actorId.slice(0, 8)}
                      </span>
                    </p>
                    <time className="text-[10px] text-muted-foreground tabular-nums" dateTime={entry.createdAt}>
                      {formatTimestamp(entry.createdAt)}
                    </time>
                    {changes.length > 0 && (
                      <ul className="mt-2 space-y-1 rounded-md bg-muted/40 p-2 text-[10px] text-muted-foreground">
                        {changes.slice(0, compact ? 4 : 8).map((line) => (
                          <li key={line} className="truncate">
                            {line}
                          </li>
                        ))}
                        {changes.length > (compact ? 4 : 8) && (
                          <li className="text-muted-foreground/80">
                            +{changes.length - (compact ? 4 : 8)} more fields
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
