"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, AlertCircle, Target, TrendingUp, Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { usePageTitle } from "@/hooks/use-page-title";
import { api } from "@/lib/api";

interface BriefingState {
  summary: string;
  openDealCount: number;
  openDealValue: number;
  overdueCount: number;
  activeProjects: number;
  pipeline: { group: string | null; count: number; value: number | null }[];
}

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const statItems = [
  { key: "contact", label: "Contacts", href: "/entities/contact" },
  { key: "company", label: "Companies", href: "/entities/company" },
  { key: "deal", label: "Deals", href: "/entities/deal" },
  { key: "quote", label: "Quotes", href: "/entities/quote" },
  { key: "invoice", label: "Invoices", href: "/entities/invoice" },
  { key: "project", label: "Projects", href: "/entities/project" },
  { key: "task", label: "Tasks", href: "/entities/task" },
];

export default function DashboardPage() {
  usePageTitle("Dashboard");

  const [stats, setStats] = useState<Record<string, number>>({});
  const [statsLoading, setStatsLoading] = useState(true);
  const [briefing, setBriefing] = useState<BriefingState | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [briefingError, setBriefingError] = useState(false);

  useEffect(() => {
    setBriefingLoading(true);
    setBriefingError(false);
    api
      .briefing()
      .then((b) =>
        setBriefing({
          summary: b.summary,
          openDealCount: b.data.openDealCount,
          openDealValue: b.data.openDealValue,
          overdueCount: b.data.overdueActivities.length,
          activeProjects: b.data.activeProjects,
          pipeline: b.data.pipeline,
        }),
      )
      .catch(() => {
        setBriefing(null);
        setBriefingError(true);
      })
      .finally(() => setBriefingLoading(false));
  }, []);

  useEffect(() => {
    setStatsLoading(true);
    const entities = ["contact", "company", "deal", "project", "task"];
    Promise.all(
      entities.map(async (e) => {
        try {
          const result = await api.list(e);
          return [e, result.total] as const;
        } catch {
          return [e, 0] as const;
        }
      }),
    )
      .then((results) => setStats(Object.fromEntries(results)))
      .finally(() => setStatsLoading(false));
  }, []);

  const maxPipelineValue = Math.max(...(briefing?.pipeline.map((p) => p.value ?? 0) ?? [1]), 1);
  const dealCount = stats.deal ?? 0;
  const projectCount = stats.project ?? 0;

  return (
    <div className="mx-auto w-full max-w-[1400px] p-6 md:p-8">
      <header className="mb-8">
        <h1 className="text-balance text-2xl font-bold tracking-tight md:text-3xl">Command Center</h1>
        <p className="mt-1 text-sm text-muted-foreground">Real-time overview of your CRM and projects</p>
      </header>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8">
          {briefingLoading ? (
            <Card className="glass-card shadow-layered">
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-40" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <div className="flex gap-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </CardContent>
            </Card>
          ) : briefingError ? (
            <Card className="border-destructive/30 shadow-layered">
              <CardContent className="flex items-start gap-3 py-6">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
                <div>
                  <p className="font-medium">Briefing unavailable</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Check your API connection or try refreshing the page.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : briefing ? (
            <Card className="glass-card border-primary/20 shadow-layered">
              <CardHeader className="border-b border-border/80 bg-muted/20 pb-4">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                  Today&apos;s Briefing
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <p className="mb-4 text-sm leading-relaxed">{briefing.summary}</p>
                <div className="mb-4 flex flex-wrap gap-3">
                  <Badge variant="secondary" className="tabular-nums">
                    {briefing.openDealCount} open deals ({currency.format(briefing.openDealValue)})
                  </Badge>
                  <Badge variant="secondary" className="tabular-nums">
                    {briefing.activeProjects} active projects
                  </Badge>
                  <Badge variant={briefing.overdueCount > 0 ? "destructive" : "secondary"} className="tabular-nums">
                    {briefing.overdueCount} overdue activities
                  </Badge>
                </div>

                {briefing.pipeline.length > 0 && (
                  <>
                    <Separator className="mb-4" />
                    <div>
                      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Target className="h-4 w-4" aria-hidden="true" />
                        Pipeline by Stage
                      </div>
                      <div className="space-y-3">
                        {briefing.pipeline.map((stage) => {
                          const value = stage.value ?? 0;
                          const width = Math.max(4, Math.round((value / maxPipelineValue) * 100));
                          return (
                            <div key={stage.group ?? "unknown"}>
                              <div className="mb-1 flex items-center justify-between text-sm">
                                <span className="capitalize">{stage.group ?? "Unassigned"}</span>
                                <span className="tabular-nums text-muted-foreground">
                                  {stage.count} · {currency.format(value)}
                                </span>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
                                  style={{ width: `${width}%` }}
                                  role="presentation"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <Link
                        href="/entities/deal"
                        className="mt-4 inline-block text-sm text-primary hover:underline touch-manipulation"
                      >
                        View all deals →
                      </Link>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="col-span-12 space-y-4 lg:col-span-4">
          <Card className="glass-card rounded-xl shadow-layered">
            <CardContent className="p-5">
              <div className="mb-4 flex items-start justify-between">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Open Pipeline</p>
                <TrendingUp className="h-4 w-4 text-emerald-500" aria-hidden="true" />
              </div>
              {statsLoading || briefingLoading ? (
                <Skeleton className="h-9 w-32" />
              ) : briefingError || !briefing ? (
                <p className="text-sm text-muted-foreground">Pipeline stats unavailable right now.</p>
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="tabular-nums text-3xl font-bold">{currency.format(briefing.openDealValue)}</span>
                  </div>
                  <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${Math.min(100, (briefing.openDealCount / Math.max(dealCount, 1)) * 100)}%` }}
                      role="presentation"
                    />
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground tabular-nums">
                    {briefing.openDealCount} of {dealCount.toLocaleString()} deals open
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card rounded-xl shadow-layered">
            <CardContent className="p-5">
              <div className="mb-4 flex items-start justify-between">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Active Projects</p>
                <Layers className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
              {statsLoading ? (
                <Skeleton className="h-9 w-16" />
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="tabular-nums text-3xl font-bold">{projectCount.toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {briefing?.activeProjects ?? 0} in progress
                    </span>
                  </div>
                  <div className="mt-4 flex gap-1">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-1.5 flex-1 rounded-full ${i < Math.min(4, briefing?.activeProjects ?? 0) ? "bg-primary" : "bg-muted"}`}
                        role="presentation"
                      />
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            {statItems.map((item) => (
              <Link key={item.key} href={item.href} className="group touch-manipulation">
                <Card className="glass-card h-full rounded-xl transition-[border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-primary/40 motion-reduce:transform-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      {item.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {statsLoading ? (
                      <Skeleton className="h-9 w-16" />
                    ) : (
                      <p className="tabular-nums text-3xl font-bold tracking-tight">
                        {stats[item.key]?.toLocaleString() ?? "—"}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
