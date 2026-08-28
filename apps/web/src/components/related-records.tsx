"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, isStatusValue } from "@/components/status-badge";
import { api, type RelatedRecords } from "@/lib/api";
import { recordLabel } from "@/lib/entity-ui";

/**
 * What else touches this record.
 *
 * A detail page used to show a record's own columns and stop there, which for a
 * company is the least interesting thing about it — nobody opens Orbit Robotics
 * to re-read its postcode. They open it to see the deals, the people, and what
 * is still owed. Those relationships were already known: this is the same graph
 * that decides whether deleting the company is safe.
 */

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** The one field worth showing beside each related record's name. */
const SUMMARY_FIELD: Record<string, { field: string; format?: "currency" }> = {
  deal: { field: "value", format: "currency" },
  quote: { field: "total", format: "currency" },
  invoice: { field: "total", format: "currency" },
  project: { field: "status" },
  task: { field: "status" },
  contact: { field: "title" },
  activity: { field: "type" },
};

function summaryOf(entity: string, record: Record<string, unknown>): React.ReactNode {
  const spec = SUMMARY_FIELD[entity];
  const raw = spec ? record[spec.field] : undefined;
  if (raw === null || raw === undefined || raw === "") return null;
  if (spec?.format === "currency") {
    return <span className="tabular-nums">{currency.format(Number(raw))}</span>;
  }
  if (isStatusValue(raw)) return <StatusBadge value={String(raw)} />;
  return <span className="truncate">{String(raw)}</span>;
}

export function RelatedRecordsPanel({ entity, id }: { entity: string; id: string }) {
  const [data, setData] = useState<RelatedRecords | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .related(entity, id)
      .then((result) => active && setData(result))
      .catch(() => active && setData(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [entity, id]);

  if (loading) {
    return (
      <Card className="border-border/80 shadow-layered">
        <CardHeader className="pb-3">
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Nothing points here, so there is nothing to say. An empty "Related" card
  // would be a permanent blank box on every record that has no relations.
  if (!data || data.groups.length === 0) return null;

  return (
    <Card className="border-border/80 shadow-layered">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Related
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {data.rollups.length > 0 && (
          <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-border/70 pb-4">
            {data.rollups.map((rollup) => (
              <div key={rollup.label}>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {rollup.label}
                </p>
                <p className="mt-0.5 text-lg font-bold tabular-nums tracking-tight">
                  {rollup.format === "currency"
                    ? currency.format(rollup.value)
                    : rollup.value.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}

        {data.groups.map((group) => (
          <div key={`${group.entity}-${group.field}`}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-medium">
                {group.label}
                <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                  {group.total}
                </span>
              </h3>
              {group.totalValue !== undefined && group.totalValue > 0 && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {currency.format(group.totalValue)}
                </span>
              )}
            </div>
            <ul className="space-y-1">
              {group.records.map((record) => (
                <li key={String(record.id)}>
                  <Link
                    href={`/entities/${group.entity}/${String(record.id)}`}
                    className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/40 touch-manipulation"
                  >
                    <span className="min-w-0 flex-1 truncate">{recordLabel(record)}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {summaryOf(group.entity, record)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {group.total > group.records.length && (
              <Link
                href={`/entities/${group.entity}?filter.${group.field}=${id}`}
                className="mt-1.5 inline-flex items-center gap-1 px-2 text-xs text-primary hover:underline touch-manipulation"
              >
                {group.total - group.records.length} more
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
