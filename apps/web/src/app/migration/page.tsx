"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Import,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronRight,
  RotateCcw,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { usePageTitle } from "@/hooks/use-page-title";
import { cn } from "@/lib/utils";
import { CsvImportCard } from "@/components/csv-import-card";

type Step = "connect" | "preview" | "import" | "report";

interface ImportResultRow {
  entity: string;
  sourceCount?: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

interface MigrationReport {
  jobId?: string;
  source?: string;
  status?: string;
  dryRun?: boolean;
  results?: ImportResultRow[];
  limitations?: string[];
  startedAt?: string;
  completedAt?: string;
}

const STEPS: { id: Step; label: string }[] = [
  { id: "connect", label: "Connect" },
  { id: "preview", label: "Preview" },
  { id: "import", label: "Import" },
  { id: "report", label: "Report" },
];

function stepIndex(step: Step): number {
  return STEPS.findIndex((s) => s.id === step);
}

function formatReportValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return value.toLocaleString();
  if (Array.isArray(value)) {
    if (value.length === 0) return "None";
    if (typeof value[0] === "object") return `${value.length} items`;
    return value.join(", ");
  }
  if (typeof value === "object") return `${Object.keys(value as object).length} fields`;
  return String(value);
}

export default function MigrationPage() {
  usePageTitle("Import from Odoo");
  const [config, setConfig] = useState({ url: "", database: "", username: "", password: "" });
  const [connected, setConnected] = useState(false);
  const [models, setModels] = useState<{ model: string; entity: string; count: number }[]>([]);
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastDryRun, setLastDryRun] = useState<boolean | null>(null);
  const [sourceTab, setSourceTab] = useState<"odoo" | "csv">("odoo");
  const [entities, setEntities] = useState<{ name: string; label: string; pluralLabel: string }[]>([]);

  useEffect(() => {
    api.getEntities().then((r) => setEntities(r.entities)).catch(() => {});
  }, []);

  const step: Step = report
    ? "report"
    : loading && connected
      ? "import"
      : connected
        ? "preview"
        : "connect";

  const currentStepIndex = stepIndex(step);

  async function handleConnect() {
    setLoading(true);
    setError("");
    setReport(null);
    setLastDryRun(null);
    try {
      const result = await api.odooConnect(config);
      setConnected(result.connected);
      setModels(result.models);
    } catch (err) {
      setConnected(false);
      setModels([]);
      setError((err as Error).message || "Connection failed. Verify your Odoo URL, database name, and credentials.");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport(dryRun: boolean) {
    setLoading(true);
    setError("");
    try {
      const result = await api.odooImport(config, dryRun);
      setReport(result as MigrationReport);
      setLastDryRun(dryRun);
    } catch (err) {
      setError((err as Error).message || "Import failed. Run a dry run first to preview changes.");
    } finally {
      setLoading(false);
    }
  }

  function resetWizard() {
    setConnected(false);
    setModels([]);
    setReport(null);
    setError("");
    setLastDryRun(null);
  }

  const totalRecords = models.reduce((sum, m) => sum + m.count, 0);
  const reportResults = report?.results ?? [];
  const totalCreated = reportResults.reduce((sum, r) => sum + (r.created ?? 0), 0);
  const totalUpdated = reportResults.reduce((sum, r) => sum + (r.updated ?? 0), 0);
  const totalErrors = reportResults.reduce((sum, r) => sum + (r.errors?.length ?? 0), 0);
  const totalSource = reportResults.reduce((sum, r) => sum + (r.sourceCount ?? 0), 0);
  const totalMigrated = reportResults.reduce((sum, r) => sum + (r.created ?? 0) + (r.updated ?? 0), 0);
  const coveragePct = totalSource > 0 ? Math.round((totalMigrated / totalSource) * 100) : null;

  return (
    <div className="mx-auto w-full max-w-3xl p-6 md:p-8">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shadow-sm">
          <Import className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bring your data</h1>
          <p className="text-sm text-muted-foreground">Migrate from Odoo directly, or import any CSV export</p>
        </div>
      </header>

      <div className="mb-6 inline-flex rounded-lg border border-border/80 bg-muted/30 p-1" role="tablist">
        {([["odoo", "From Odoo"], ["csv", "From CSV"]] as const).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={sourceTab === key}
            onClick={() => setSourceTab(key)}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              sourceTab === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {sourceTab === "csv" && <CsvImportCard entities={entities} />}

      <div className={sourceTab === "csv" ? "hidden" : undefined}>

      <nav aria-label="Migration progress" className="mb-8">
        <ol className="flex flex-wrap items-center gap-2">
          {STEPS.map((s, i) => {
            const done = i < currentStepIndex;
            const active = i === currentStepIndex;
            return (
              <li key={s.id} className="flex items-center gap-2">
                {i > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground/50" aria-hidden="true" />}
                <span
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
                    active && "border-primary/40 bg-primary/10 text-primary",
                    done && "border-border/80 bg-muted/40 text-foreground",
                    !active && !done && "border-border/80 text-muted-foreground",
                  )}
                  aria-current={active ? "step" : undefined}
                >
                  <span className="tabular-nums">{i + 1}</span>
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>
      </nav>

      {(step === "connect" || !connected) && (
        <Card className="glass-card mb-6 rounded-xl shadow-layered">
          <CardHeader className="border-b border-border/80 bg-muted/20">
            <CardTitle className="text-sm font-bold tracking-tight">Connect to Odoo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label htmlFor="odoo-url">Odoo URL</Label>
              <Input
                id="odoo-url"
                name="odoo-url"
                type="url"
                autoComplete="off"
                placeholder="https://mycompany.odoo.com…"
                value={config.url}
                onChange={(e) => setConfig({ ...config, url: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="odoo-database">Database</Label>
              <Input
                id="odoo-database"
                name="odoo-database"
                autoComplete="off"
                placeholder="mycompany…"
                value={config.database}
                onChange={(e) => setConfig({ ...config, database: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="odoo-username">Username</Label>
                <Input
                  id="odoo-username"
                  name="odoo-username"
                  autoComplete="username"
                  spellCheck={false}
                  value={config.username}
                  onChange={(e) => setConfig({ ...config, username: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="odoo-password">Password / API Key</Label>
                <Input
                  id="odoo-password"
                  name="odoo-password"
                  type="password"
                  autoComplete="current-password"
                  value={config.password}
                  onChange={(e) => setConfig({ ...config, password: e.target.value })}
                />
              </div>
            </div>
            {error && step === "connect" && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div>
                  <p>{error}</p>
                  <p className="mt-1 text-xs text-destructive/80">Check the URL includes https:// and your database name matches Odoo exactly.</p>
                </div>
              </div>
            )}
            <Button onClick={handleConnect} disabled={loading} className="touch-manipulation">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Connecting…
                </>
              ) : (
                "Connect to Odoo"
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {connected && models.length > 0 && step !== "report" && (
        <Card className="glass-card mb-6 rounded-xl shadow-layered">
          <CardHeader className="border-b border-border/80 bg-muted/20">
            <CardTitle className="flex items-center gap-2 text-sm font-bold tracking-tight">
              <CheckCircle className="h-4 w-4 text-green-500" aria-hidden="true" />
              Preview Import ({totalRecords.toLocaleString()} records)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="mb-4 space-y-2">
              {models.map((m) => (
                <div
                  key={`${m.model}-${m.entity}`}
                  className="flex justify-between border-b border-border/80 py-2 text-sm last:border-0"
                >
                  <span>
                    <span className="font-medium">{m.model}</span>
                    <span className="text-muted-foreground"> → {m.entity}</span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">{m.count.toLocaleString()} records</span>
                </div>
              ))}
            </div>
            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => handleImport(true)} disabled={loading} className="touch-manipulation">
                {loading && lastDryRun === true ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Running Dry Run…
                  </>
                ) : (
                  "Run Dry Run"
                )}
              </Button>
              <Button onClick={() => handleImport(false)} disabled={loading} className="touch-manipulation">
                {loading && lastDryRun === false ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Importing…
                  </>
                ) : (
                  "Start Import"
                )}
              </Button>
              <Button variant="ghost" onClick={resetWizard} disabled={loading} className="touch-manipulation">
                <RotateCcw className="mr-1 h-4 w-4" aria-hidden="true" />
                Change Connection
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {report && (
        <Card className="glass-card rounded-xl shadow-layered">
          <CardHeader className="border-b border-border/80 bg-muted/20">
            <CardTitle className="flex items-center gap-2 text-sm font-bold tracking-tight">
              <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
              Import Report
              {lastDryRun && (
                <Badge variant="secondary" className="ml-2 font-normal">
                  Dry Run
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Created</dt>
                <dd className="mt-1 tabular-nums text-2xl font-bold text-green-500">{totalCreated.toLocaleString()}</dd>
              </div>
              <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Updated</dt>
                <dd className="mt-1 tabular-nums text-2xl font-bold">{totalUpdated.toLocaleString()}</dd>
              </div>
              <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Coverage</dt>
                <dd className={cn("mt-1 tabular-nums text-2xl font-bold", coveragePct !== null && coveragePct >= 95 && "text-green-500")}>
                  {coveragePct !== null ? `${coveragePct}%` : "—"}
                </dd>
              </div>
              <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Errors</dt>
                <dd className={cn("mt-1 tabular-nums text-2xl font-bold", totalErrors > 0 && "text-destructive")}>
                  {totalErrors.toLocaleString()}
                </dd>
              </div>
            </dl>

            {reportResults.length > 0 ? (
              <div className="scrollbar-thin max-h-[50vh] overflow-auto overscroll-contain rounded-lg border border-border/80">
                <table className="w-full text-left text-sm">
                  <thead className="sticky-table-header">
                    <tr className="border-b border-border/80 bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3 font-semibold">Entity</th>
                      <th className="px-4 py-3 font-semibold">Created</th>
                      <th className="px-4 py-3 font-semibold">Updated</th>
                      <th className="px-4 py-3 font-semibold">Skipped</th>
                      <th className="px-4 py-3 font-semibold">Errors</th>
                      <th className="px-4 py-3 font-semibold">Coverage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportResults.map((row) => (
                      <tr key={row.entity} className="border-b border-border/80 last:border-0">
                        <td className="px-4 py-3 font-medium capitalize">{row.entity}</td>
                        <td className="px-4 py-3 tabular-nums">{row.created.toLocaleString()}</td>
                        <td className="px-4 py-3 tabular-nums">{row.updated.toLocaleString()}</td>
                        <td className="px-4 py-3 tabular-nums">{row.skipped.toLocaleString()}</td>
                        <td className="px-4 py-3 tabular-nums">{row.errors?.length ?? 0}</td>
                        <td className="px-4 py-3 tabular-nums">
                          {row.sourceCount
                            ? `${Math.min(100, Math.round(((row.created + row.updated) / row.sourceCount) * 100))}%`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <dl className="space-y-3 text-sm">
                {Object.entries(report)
                  .filter(([key]) => !["results"].includes(key))
                  .map(([key, value]) => (
                    <div key={key} className="flex flex-col gap-1 border-b border-border/80 pb-2 last:border-0 sm:flex-row sm:justify-between">
                      <dt className="font-medium capitalize text-muted-foreground">{key.replace(/([A-Z])/g, " $1").trim()}</dt>
                      <dd className="tabular-nums">{formatReportValue(value)}</dd>
                    </div>
                  ))}
              </dl>
            )}

            {(report.limitations?.length ?? 0) > 0 && (
              <div className="rounded-lg border border-border/80 bg-muted/20 p-3 text-xs text-muted-foreground">
                <p className="mb-1 font-semibold uppercase tracking-wider">Known limitations</p>
                <ul className="list-inside list-disc space-y-0.5">
                  {report.limitations!.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </div>
            )}

            {reportResults.some((r) => r.errors?.length > 0) && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <p className="mb-2 text-sm font-medium text-destructive">Import Errors</p>
                <ul className="max-h-40 space-y-1 overflow-y-auto overscroll-contain text-xs text-destructive/90">
                  {reportResults.flatMap((r) =>
                    (r.errors ?? []).map((err, i) => (
                      <li key={`${r.entity}-${i}`}>
                        <span className="font-medium capitalize">{r.entity}:</span> {err}
                      </li>
                    )),
                  )}
                </ul>
              </div>
            )}

            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {lastDryRun && (
                <Button onClick={() => handleImport(false)} disabled={loading} className="touch-manipulation">
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Importing…
                    </>
                  ) : (
                    "Run Live Import"
                  )}
                </Button>
              )}
              <Button variant="outline" asChild className="touch-manipulation">
                <Link href="/dashboard">Go to Dashboard</Link>
              </Button>
              <Button variant="ghost" onClick={resetWizard} className="touch-manipulation">
                <RotateCcw className="mr-1 h-4 w-4" aria-hidden="true" />
                Start Over
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}
