"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

interface BriefingState {
  summary: string;
  openDealCount: number;
  openDealValue: number;
  overdueCount: number;
  activeProjects: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [briefing, setBriefing] = useState<BriefingState | null>(null);

  useEffect(() => {
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
      .catch(() => setBriefing(null));
  }, []);

  useEffect(() => {
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
    ).then((results) => setStats(Object.fromEntries(results)));
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
      <p className="text-muted-foreground mb-8">Welcome to Meridian — your AI-native ERP</p>

      {briefing && (
        <Card className="mb-6 border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary" /> Today&apos;s Briefing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed mb-3">{briefing.summary}</p>
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span>
                <strong className="text-foreground">{briefing.openDealCount}</strong> open deals ($
                {briefing.openDealValue.toLocaleString()})
              </span>
              <span>
                <strong className="text-foreground">{briefing.activeProjects}</strong> active projects
              </span>
              <span className={briefing.overdueCount > 0 ? "text-destructive" : ""}>
                <strong>{briefing.overdueCount}</strong> overdue activities
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { key: "contact", label: "Contacts", href: "/entities/contact" },
          { key: "company", label: "Companies", href: "/entities/company" },
          { key: "deal", label: "Deals", href: "/entities/deal" },
          { key: "project", label: "Projects", href: "/entities/project" },
          { key: "task", label: "Tasks", href: "/entities/task" },
        ].map((item) => (
          <Link key={item.key} href={item.href}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{item.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats[item.key] ?? "—"}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
