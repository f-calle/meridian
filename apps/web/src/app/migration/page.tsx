"use client";

import { useState } from "react";
import { Import, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

type Step = "connect" | "preview" | "import" | "report";

export default function MigrationPage() {
  const [config, setConfig] = useState({ url: "", database: "", username: "", password: "" });
  const [connected, setConnected] = useState(false);
  const [models, setModels] = useState<{ model: string; entity: string; count: number }[]>([]);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const step: Step = report ? "report" : connected ? "preview" : "connect";

  async function handleConnect() {
    setLoading(true);
    setError("");
    try {
      const result = await api.odooConnect(config);
      setConnected(result.connected);
      setModels(result.models);
      setReport(null);
    } catch (err) {
      setError((err as Error).message || "Connection failed. Verify your Odoo URL and credentials.");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport(dryRun: boolean) {
    setLoading(true);
    setError("");
    try {
      const result = await api.odooImport(config, dryRun);
      setReport(result);
    } catch (err) {
      setError((err as Error).message || "Import failed. Try a dry run first to preview changes.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl p-6 md:p-8">
      <header className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Import className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Import from Odoo</h1>
          <p className="text-sm text-muted-foreground">Migrate your CRM and project data from Odoo</p>
        </div>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        {(["connect", "preview", "import", "report"] as Step[]).map((s, i) => (
          <Badge
            key={s}
            variant={step === s ? "default" : s === "connect" || (s === "preview" && connected) || (s === "report" && report) ? "secondary" : "outline"}
            className="capitalize"
          >
            {i + 1}. {s}
          </Badge>
        ))}
      </div>

      <Card className="mb-6 border-border/80 shadow-elevated">
        <CardHeader>
          <CardTitle className="text-lg">Connect to Odoo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
          {error && (
            <div className="flex items-start gap-2 text-sm text-destructive" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
          <Button onClick={handleConnect} disabled={loading} className="touch-manipulation">
            {loading && step === "connect" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Connecting…
              </>
            ) : (
              "Connect"
            )}
          </Button>
        </CardContent>
      </Card>

      {connected && models.length > 0 && (
        <Card className="mb-6 border-border/80 shadow-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCircle className="h-5 w-5 text-green-500" aria-hidden="true" /> Connected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 space-y-2">
              {models.map((m) => (
                <div key={`${m.model}-${m.entity}`} className="flex justify-between border-b border-border/80 py-2 text-sm last:border-0">
                  <span>{m.model} → {m.entity}</span>
                  <span className="tabular-nums text-muted-foreground">{m.count.toLocaleString()} records</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => handleImport(true)} disabled={loading} className="touch-manipulation">
                Dry Run
              </Button>
              <Button onClick={() => handleImport(false)} disabled={loading} className="touch-manipulation">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Importing…
                  </>
                ) : (
                  "Start Import"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {report && (
        <Card className="border-border/80 shadow-elevated">
          <CardHeader>
            <CardTitle className="text-lg">Import Report</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              {Object.entries(report).map(([key, value]) => (
                <div key={key} className="flex flex-col gap-1 border-b border-border/80 pb-2 last:border-0 sm:flex-row sm:justify-between">
                  <dt className="font-medium capitalize text-muted-foreground">{key.replace(/_/g, " ")}</dt>
                  <dd className="tabular-nums">{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
