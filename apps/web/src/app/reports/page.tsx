"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart } from "@/components/bar-chart";
import { StackedBar } from "@/components/stacked-bar";
import { usePageTitle } from "@/hooks/use-page-title";
import { api, type ReportSet } from "@/lib/api";

/**
 * Reports.
 *
 * This page used to be four charts grouped by status — invoices by status,
 * tasks by status, projects by status, deals by stage — which is the entity
 * list redrawn as bars. Nothing had a time axis, so nothing could answer "is
 * this better than last month", and three of the four duplicated the home page.
 *
 * Each report here is chosen for the decision it drives, and each says so in a
 * subtitle, because a chart nobody can act on is decoration.
 */

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function Report({
  title,
  question,
  children,
  aside,
}: {
  title: string;
  question: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <Card className="glass-card shadow-layered">
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{question}</p>
        </div>
        {aside}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="shrink-0 text-right">
      <p className="text-lg font-bold tabular-nums leading-tight">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

export default function ReportsPage() {
  usePageTitle("Reports");
  const [data, setData] = useState<ReportSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    api
      .reports()
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const overdue = (data?.aging ?? [])
    .filter((b) => b.label !== "Not yet due")
    .reduce((sum, b) => sum + b.value, 0);
  const topShare = data?.concentration[0]?.share ?? 0;

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1400px] p-6 md:p-8">
        <Skeleton className="mb-6 h-9 w-40" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] p-6 md:p-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-balance text-2xl font-bold tracking-tight md:text-3xl">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Money owed, what is landing, and where deals stall.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-2">
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
        </Button>
      </header>

      {error && (
        <Card className="mb-6 border-destructive/30 shadow-layered">
          <CardContent className="flex items-start gap-3 py-5">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
            <div>
              <p className="font-medium">Couldn&apos;t load reports</p>
              <p className="mt-1 text-sm text-muted-foreground">Check your connection and refresh.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Report
          title="Receivables aging"
          question="How much am I owed, and how late is it?"
          aside={<Figure label="past due" value={currency.format(overdue)} />}
        >
          <BarChart
            data={(data?.aging ?? []).map((b) => ({ label: b.label, value: b.value, count: b.count }))}
            format={(v) => currency.format(v)}
            emptyLabel="Nothing outstanding"
          />
          <Link
            href="/entities/invoice"
            className="mt-4 inline-block text-sm text-primary hover:underline"
          >
            Open invoices →
          </Link>
        </Report>

        <Report
          title="Forecast"
          question="What is likely to land, month by month?"
          aside={
            <Figure
              label="next 6 months"
              value={currency.format((data?.forecast ?? []).reduce((s, b) => s + b.value, 0))}
            />
          }
        >
          <BarChart
            data={(data?.forecast ?? []).map((b) => ({ label: b.label, value: b.value, count: b.count }))}
            format={(v) => currency.format(v)}
            emptyLabel="No open deals with a close date"
          />
          <p className="mt-3 text-xs text-muted-foreground">
            Open pipeline weighted by each deal&apos;s win probability.
          </p>
        </Report>

        <Report
          title="Bookings"
          question="What did we actually win, and when?"
          aside={
            <Figure
              label="last 12 months"
              value={currency.format((data?.bookings ?? []).reduce((s, b) => s + b.value, 0))}
            />
          }
        >
          <BarChart
            data={(data?.bookings ?? []).map((b) => ({ label: b.label, value: b.value, count: b.count }))}
            format={(v) => currency.format(v)}
            emptyLabel="No deals closed yet"
          />
        </Report>

        <Report title="Stalled pipeline" question="How much open value has gone past its close date?">
          <StackedBar
            data={(data?.stalled ?? []).map((s) => ({
              label: s.stage,
              onTrack: s.onTrack,
              pastDue: s.pastDue,
            }))}
            format={(v) => currency.format(v)}
            emptyLabel="No open deals"
          />
        </Report>

        <Report
          title="Revenue concentration"
          question="Who pays me, and how exposed am I?"
          aside={
            topShare > 0 ? (
              <Figure label="from the top client" value={`${Math.round(topShare * 100)}%`} />
            ) : undefined
          }
        >
          <BarChart
            data={(data?.concentration ?? []).map((c) => ({
              label: c.name,
              value: c.value,
              tooltip: `${Math.round(c.share * 100)}% of invoiced revenue`,
            }))}
            format={(v) => currency.format(v)}
            emptyLabel="No invoiced revenue yet"
          />
        </Report>

        <Report
          title="Quote outcomes"
          question="What happens to what we propose?"
          aside={
            data?.acceptanceRate !== null && data?.acceptanceRate !== undefined ? (
              <Figure label="accepted by value" value={`${Math.round(data.acceptanceRate * 100)}%`} />
            ) : undefined
          }
        >
          <BarChart
            data={(data?.quoteOutcomes ?? []).map((b) => ({ label: b.label, value: b.value, count: b.count }))}
            format={(v) => currency.format(v)}
            emptyLabel="No quotes yet"
          />
        </Report>
      </div>
    </div>
  );
}
