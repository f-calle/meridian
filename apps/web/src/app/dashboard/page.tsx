"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Banknote,
  Percent,
  CalendarDays,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/stat-tile";
import { AttentionQueue } from "@/components/attention-queue";
import { PipelineFunnel } from "@/components/pipeline-funnel";
import { TodaySchedule } from "@/components/today-schedule";
import { usePageTitle } from "@/hooks/use-page-title";
import { cn } from "@/lib/utils";
import { api, type AttentionSummary, type DashboardMetrics } from "@/lib/api";

/**
 * Home.
 *
 * This page used to be a scoreboard: seven tiles counting rows, an AI
 * paragraph, and a bar chart. Nothing on it was work — you read it, learned
 * that 26 contacts existed, and then went hunting for what actually needed you.
 *
 * It now leads with the queue. The numbers above it are the four an owner
 * steers by, and the biggest is the weighted forecast rather than the raw
 * pipeline, because "$1.7M in play" and "$717k realistically landing" are very
 * different claims and only one of them is a plan.
 */

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  usePageTitle("Home");

  const [attention, setAttention] = useState<AttentionSummary | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    Promise.all([api.attention(12), api.metrics()])
      .then(([a, m]) => {
        setAttention(a);
        setMetrics(m);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  // The briefing is a model call, so it loads on its own and never holds up the
  // numbers or the queue — the parts of the page you can act on.
  useEffect(() => {
    setBriefingLoading(true);
    api
      .briefing()
      .then((b) => setBriefing(b.summary))
      .catch(() => setBriefing(null))
      .finally(() => setBriefingLoading(false));
  }, []);

  const totalNeedingAttention = attention
    ? Object.values(attention.counts).reduce((sum, n) => sum + n, 0)
    : 0;

  /**
   * Rendered twice — once in the sidebar, once above the queue — with only one
   * visible at a time. The stacked mobile layout puts the sidebar after the
   * whole attention queue, which is the wrong end of a phone screen for the
   * thing you are checking at nine in the morning.
   */
  function TodayCard({ className }: { className?: string }) {
    return (
      <Card className={cn("glass-card shadow-layered", className)}>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Today
          </CardTitle>
          {!loading && attention && attention.today.total > attention.today.items.length && (
            <span className="text-xs text-muted-foreground tabular-nums">
              showing {attention.today.items.length} of {attention.today.total}
            </span>
          )}
        </CardHeader>
        <CardContent>
          <TodaySchedule items={attention?.today.items ?? []} loading={loading} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] p-6 md:p-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-balance text-2xl font-bold tracking-tight md:text-3xl">
            {greeting()}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
            {!loading && attention && (
              <>
                {" · "}
                {totalNeedingAttention === 0
                  ? "nothing overdue"
                  : `${totalNeedingAttention} item${totalNeedingAttention === 1 ? "" : "s"} need you`}
              </>
            )}
            {!loading && attention && attention.today.total > 0 && (
              <>
                {" · "}
                {attention.today.total} on today
              </>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
          Refresh
        </Button>
      </header>

      {error && (
        <Card className="mb-6 border-destructive/30 shadow-layered">
          <CardContent className="flex items-start gap-3 py-5">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
            <div>
              <p className="font-medium">Couldn&apos;t load your dashboard</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Check your connection, then try refreshing.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {loading || !metrics ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)
        ) : (
          <>
            <StatTile
              hero
              label="Forecast"
              value={currency.format(metrics.weightedForecast)}
              caption={`from ${currency.format(metrics.openValue)} across ${metrics.openCount} open deals`}
              icon={TrendingUp}
            />
            <StatTile
              label="Won"
              value={currency.format(metrics.wonValue)}
              caption={`${metrics.wonCount} deal${metrics.wonCount === 1 ? "" : "s"} closed`}
              icon={Target}
              tone="good"
            />
            <StatTile
              label="Owed to you"
              value={currency.format(metrics.outstandingValue)}
              caption={
                attention && attention.overdueValue > 0
                  ? `${currency.format(attention.overdueValue)} of it overdue`
                  : "nothing overdue"
              }
              icon={Banknote}
              tone={attention && attention.overdueValue > 0 ? "warning" : "neutral"}
            />
            <StatTile
              label="Win rate"
              value={metrics.winRate === null ? "—" : `${Math.round(metrics.winRate * 100)}%`}
              caption={
                metrics.winRate === null
                  ? "no deals closed yet"
                  : `${metrics.wonCount} won · ${metrics.lostCount} lost`
              }
              icon={Percent}
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:hidden">
          <TodayCard />
        </div>

        <div className="col-span-12 lg:col-span-7 xl:col-span-8">
          <Card className="glass-card shadow-layered">
            <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border/80 bg-muted/20 pb-4">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Needs you
              </CardTitle>
              {!loading && totalNeedingAttention > (attention?.items.length ?? 0) && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  showing {attention?.items.length} of {totalNeedingAttention}
                </span>
              )}
            </CardHeader>
            <CardContent className="pt-4">
              <AttentionQueue items={attention?.items ?? []} loading={loading} />
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 space-y-4 lg:col-span-5 xl:col-span-4">
          <TodayCard className="hidden lg:block" />

          <Card className="glass-card border-primary/20 shadow-layered">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                Briefing
              </CardTitle>
            </CardHeader>
            <CardContent>
              {briefingLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ) : briefing ? (
                <p className="text-sm leading-relaxed">{briefing}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Briefing unavailable. The rest of this page is unaffected.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card shadow-layered">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Pipeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading || !metrics ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <PipelineFunnel pipeline={metrics.pipeline} />
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2 text-sm">
            <Link
              href="/entities/deal"
              className="rounded-md border border-border/80 px-3 py-1.5 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground touch-manipulation"
            >
              All deals
            </Link>
            <Link
              href="/entities/invoice"
              className="rounded-md border border-border/80 px-3 py-1.5 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground touch-manipulation"
            >
              Invoices
            </Link>
            <Link
              href="/reports"
              className="rounded-md border border-border/80 px-3 py-1.5 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground touch-manipulation"
            >
              Reports
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
