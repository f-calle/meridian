"use client";

import { useState } from "react";
import { Import, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

export default function MigrationPage() {
  const [config, setConfig] = useState({ url: "", database: "", username: "", password: "" });
  const [connected, setConnected] = useState(false);
  const [models, setModels] = useState<{ model: string; entity: string; count: number }[]>([]);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleConnect() {
    setLoading(true);
    setError("");
    try {
      const result = await api.odooConnect(config);
      setConnected(result.connected);
      setModels(result.models);
    } catch (err) {
      setError((err as Error).message);
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
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Import className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Import from Odoo</h1>
          <p className="text-sm text-muted-foreground">Migrate your CRM and project data from Odoo</p>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Connect to Odoo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Odoo URL</Label>
            <Input
              placeholder="https://mycompany.odoo.com"
              value={config.url}
              onChange={(e) => setConfig({ ...config, url: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Database</Label>
            <Input
              placeholder="mycompany"
              value={config.database}
              onChange={(e) => setConfig({ ...config, database: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input
                value={config.username}
                onChange={(e) => setConfig({ ...config, username: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Password / API Key</Label>
              <Input
                type="password"
                value={config.password}
                onChange={(e) => setConfig({ ...config, password: e.target.value })}
              />
            </div>
          </div>
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          )}
          <Button onClick={handleConnect} disabled={loading}>
            {loading ? "Connecting..." : "Connect"}
          </Button>
        </CardContent>
      </Card>

      {connected && models.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" /> Connected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 mb-4">
              {models.map((m) => (
                <div key={`${m.model}-${m.entity}`} className="flex justify-between text-sm py-2 border-b border-border last:border-0">
                  <span>{m.model} → {m.entity}</span>
                  <span className="text-muted-foreground">{m.count} records</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleImport(true)} disabled={loading}>
                Dry Run
              </Button>
              <Button onClick={() => handleImport(false)} disabled={loading}>
                {loading ? "Importing..." : "Start Import"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {report && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Import Report</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-4 rounded-md overflow-auto max-h-64">
              {JSON.stringify(report, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
