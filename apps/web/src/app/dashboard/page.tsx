"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

interface BriefingState {
  summary: string;
  openDealCount: number;
  openDealValue: number;
  overdueCount: number;
  activeProjects: number;
}

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const statItems = [
  { key: "contact", label: "Contacts", href: "/entities/contact" },
  { key: "company", label: "Companies", href: "/entities/company" },
  { key: "deal", label: "Deals", href: "/entities/deal" },
  { key: "project", label: "Projects", href: "/entities/project" },
  { key: "task", label: "Tasks", href: "/entities/task" },
];

export default function DashboardPage() {
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

  return (
    <div className="p-6 md:p-8">
      <header className="mb-8">
        <h1 className="text-balance text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">Welcome to Meridian, your AI-native ERP</p>
      </header>

      {briefingLoading ? (
        <Card className="mb-6 border-primary/20 shadow-elevated">
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
        <Card className="mb-6 border-destructive/30 shadow-elevated">
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
        <Card className="mb-6 border-primary/30 shadow-elevated">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" /> Today&apos;s Briefing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm leading-relaxed">{briefing.summary}</p>
            <div className="flex flex-wrap gap-3">
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
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {statItems.map((item) => (
          <Link key={item.key} href={item.href} className="group touch-manipulation">
            <Card className="h-full border-border/80 shadow-elevated transition-[border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-primary/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{item.label}</CardTitle>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-9 w-16" />
                ) : (
                  <p className="tabular-nums text-3xl font-bold tracking-tight">{stats[item.key] ?? "—"}</p>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
