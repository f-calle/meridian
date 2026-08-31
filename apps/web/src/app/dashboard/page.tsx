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
 *
 * On desktop the page is a fixed multi-pane cockpit: a one-line header and the
 * stat strip stay put, and the panes below split the remaining height and
 * scroll internally — queue + rail at lg, queue + schedule + rail at xl. A
 * command center you have to scroll hides exactly the overflow it exists to
 * surface — item thirteen below the fold is an item you will not act on. The
 * chrome above the panes is kept deliberately shallow so the locked layout
 * survives short laptop viewports instead of falling back to page scroll.
 * Below lg the panels stack and the page scrolls normally; locking a phone
 * screen into four competing scroll regions would be the opposite of the fix.
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
    // The queue pane scrolls, so it can hold a real backlog rather than a
    // teaser — the API caps the limit at 50.
    Promise.all([api.attention(30), api.metrics()])
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
   * Rendered three times — its own pane at xl, in the rail at lg, above the
   * queue on mobile — with only one visible at a time. The stacked mobile
   * layout puts the rail after the whole attention queue, which is the wrong
   * end of a phone screen for the thing you are checking at nine in the
   * morning.
   */
  function TodayCard({ className }: { className?: string }) {
    return (
      <Card className={cn("glass-card shadow-layered", className)}>
        <CardHeader className="shrink-0 flex-row items-center justify-between space-y-0 pb-3">
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
        <CardContent className="scrollbar-thin lg:scroll-fade-b lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain">
          <TodaySchedule items={attention?.today.items ?? []} loading={loading} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 md:p-6 lg:flex lg:h-full lg:flex-col">
      {/* One line, not a masthead: every row the chrome spends here is a row
          the panes lose, and on a 768-high laptop that difference is whether
          the locked layout survives at all. */}
      <header className="mb-4 flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">{greeting()}</h1>
        <p className="text-sm text-muted-foreground">
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
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          disabled={loading}
          className="ml-auto gap-2"
        >
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
          Refresh
        </Button>
      </header>

      {error && (
        <Card className="mb-4 shrink-0 border-destructive/30 shadow-layered">
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

      <div className="mb-4 grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
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

      {/* The min-h floor is the escape hatch for genuinely tiny windows:
          rather than crushing the panes into letterboxes, the page falls back
          to scrolling as a whole. */}
      <div className="grid grid-cols-12 gap-4 lg:min-h-[14rem] lg:flex-1">
        <div className="col-span-12 lg:hidden">
          <TodayCard />
        </div>

        <div className="col-span-12 lg:col-span-7 xl:col-span-6 lg:min-h-0">
          <Card className="glass-card shadow-layered lg:flex lg:h-full lg:flex-col">
            <CardHeader className="shrink-0 flex-row items-center justify-between space-y-0 border-b border-border/80 bg-muted/20 pb-4">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Needs you
              </CardTitle>
              {!loading && totalNeedingAttention > (attention?.items.length ?? 0) && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  showing {attention?.items.length} of {totalNeedingAttention}
                </span>
              )}
            </CardHeader>
            <CardContent className="scrollbar-thin pt-4 lg:scroll-fade-b lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain">
              <AttentionQueue items={attention?.items ?? []} loading={loading} />
            </CardContent>
          </Card>
        </div>

        {/* At xl the schedule earns a pane of its own; at lg it lives in the
            rail below. Third render of TodayCard — same only-one-visible deal
            as the mobile copy. */}
        <TodayCard className="hidden xl:col-span-3 xl:flex xl:min-h-0 xl:flex-col" />

        {/* Briefing, pipeline and links keep their natural height; whatever
            flexes (Today at lg, the pipeline always) absorbs the rest and
            scrolls its own list, so the rail normally fills the track exactly
            and no card gets sliced at the fold. The rail's own overflow-y is
            the escape hatch for an unusually long briefing, and the -m/p pair
            keeps card shadows out of its clipping edge. */}
        <div className="scrollbar-thin col-span-12 space-y-3 lg:col-span-5 xl:col-span-3 lg:-m-1 lg:flex lg:min-h-0 lg:flex-col lg:overflow-y-auto lg:overscroll-contain lg:p-1">
          <TodayCard className="hidden lg:flex lg:min-h-20 lg:flex-1 lg:flex-col xl:hidden" />

          {/* Every rail card can give ground on a short screen — a fixed
              briefing once squeezed the pipeline down to a bare header.
              max-h-fit keeps them at natural size whenever there's room. */}
          <Card className="glass-card border-primary/20 shadow-layered lg:flex lg:max-h-fit lg:min-h-16 lg:flex-1 lg:flex-col">
            <CardHeader className="shrink-0 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                Briefing
              </CardTitle>
            </CardHeader>
            <CardContent className="scrollbar-thin lg:scroll-fade-b lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain">
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

          <Card className="glass-card shadow-layered lg:flex lg:max-h-fit lg:min-h-16 lg:flex-1 lg:flex-col">
            <CardHeader className="shrink-0 pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Pipeline
              </CardTitle>
            </CardHeader>
            <CardContent className="scrollbar-thin lg:scroll-fade-b lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain">
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

          <div className="flex shrink-0 flex-wrap gap-2 text-sm">
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
