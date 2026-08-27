"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, TrendingUp, Wallet, CircleDollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, type BarDatum } from "@/components/bar-chart";
import { usePageTitle } from "@/hooks/use-page-title";
import { api } from "@/lib/api";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const OPEN_STAGES = new Set(["lead", "qualified", "proposal"]);
const STAGE_ORDER = ["lead", "qualified", "proposal", "won", "lost"];
const INVOICE_ORDER = ["draft", "sent", "partial", "paid", "overdue", "cancelled"];

function orderBy(rows: BarDatum[], order: string[]): BarDatum[] {
  return [...rows].sort((a, b) => {
    const ai = order.indexOf(a.label);
    const bi = order.indexOf(b.label);
    if (ai === -1 && bi === -1) return b.value - a.value;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

interface Aggregates {
  pipeline: BarDatum[];
  invoices: BarDatum[];
  tasks: BarDatum[];
  projects: BarDatum[];
}

export default function ReportsPage() {
  usePageTitle("Reports");
  const [data, setData] = useState<Aggregates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [pipeline, invoices, tasks, projects] = await Promise.all([
        api.aggregate("deal", { groupBy: "stage", metric: "sum", metricField: "value" }),
        api.aggregate("invoice", { groupBy: "status", metric: "sum", metricField: "total" }),
        api.aggregate("task", { groupBy: "status" }),
        api.aggregate("project", { groupBy: "status" }),
      ]);
      const toData = (rows: { group: string | null; count: number; value: number | null }[]) =>
        rows.map((r) => ({ label: r.group ?? "unset", value: r.value ?? r.count, count: r.count }));
      setData({
        pipeline: orderBy(toData(pipeline.rows), STAGE_ORDER),
        invoices: orderBy(toData(invoices.rows), INVOICE_ORDER),
        tasks: toData(tasks.rows).map((t) => ({ ...t, value: t.count ?? 0 })),
        projects: toData(projects.rows).map((p) => ({ ...p, value: p.count ?? 0 })),
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openPipeline = (data?.pipeline ?? [])
    .filter((d) => OPEN_STAGES.has(d.label))
    .reduce((a, d) => a + d.value, 0);
  const openCount = (data?.pipeline ?? [])
    .filter((d) => OPEN_STAGES.has(d.label))
    .reduce((a, d) => a + (d.count ?? 0), 0);
  const won = (data?.pipeline ?? []).find((d) => d.label === "won");
  const outstanding = (data?.invoices ?? [])
    .filter((d) => ["sent", "partial", "overdue"].includes(d.label))
    .reduce((a, d) => a + d.value, 0);
  const overdue = (data?.invoices ?? []).find((d) => d.label === "overdue");

  const tiles = [
    { label: "Open pipeline", value: currency.format(openPipeline), sub: `${openCount} deals`, icon: TrendingUp, tone: "" },
    { label: "Won", value: currency.format(won?.value ?? 0), sub: `${won?.count ?? 0} deals`, icon: CircleDollarSign, tone: "text-[var(--viz-good)]" },
    { label: "Outstanding", value: currency.format(outstanding), sub: "sent, partial & overdue", icon: Wallet, tone: "" },
    { label: "Overdue", value: currency.format(overdue?.value ?? 0), sub: `${overdue?.count ?? 0} invoices`, icon: AlertTriangle, tone: (overdue?.count ?? 0) > 0 ? "text-[var(--viz-critical)]" : "" },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Where the money and the work actually are</p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}

      <dl className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardContent className="p-4">
              <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <t.icon className="h-3.5 w-3.5" aria-hidden="true" />
                {t.label}
              </dt>
              {loading ? (
                <Skeleton className="mt-2 h-8 w-24" />
              ) : (
                <>
                  <dd className={`mt-1 tabular-nums text-2xl font-bold ${t.tone}`}>{t.value}</dd>
                  <dd className="text-xs text-muted-foreground">{t.sub}</dd>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </dl>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Pipeline value by stage</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-40" /> : <BarChart data={data?.pipeline ?? []} format={currency.format} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Invoiced value by status</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-40" /> : <BarChart data={data?.invoices ?? []} format={currency.format} emptyLabel="No invoices yet" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Tasks by status</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-40" /> : <BarChart data={data?.tasks ?? []} format={(v) => String(v)} emptyLabel="No tasks yet" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Projects by status</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-40" /> : <BarChart data={data?.projects ?? []} format={(v) => String(v)} emptyLabel="No projects yet" />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
