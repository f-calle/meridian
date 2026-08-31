"use client";

import { useRef, useState } from "react";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { AlertCircle, ArrowRight, CheckCircle2, FileUp, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import type { EntityField } from "@/lib/entity-ui";

interface MappingRow {
  column: string;
  field: string; // "" = skip this column
}

interface ImportResult {
  entity: string;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/** Parse just the header row + row count client-side for the preview. */
function csvPreview(text: string): { headers: string[]; rowCount: number } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { headers: [], rowCount: 0 };
  const headers = (lines[0].match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? [])
    .map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"').trim())
    .filter((_, i, arr) => !(i === arr.length - 1 && arr[i] === ""));
  return { headers, rowCount: Math.max(0, lines.length - 1) };
}

/**
 * CSV import for any system's export: paste or upload a file, let AI propose
 * the column mapping, adjust it by hand, dry-run, then import.
 */
export function CsvImportCard({
  entities,
}: {
  entities: { name: string; label: string; pluralLabel: string }[];
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [entity, setEntity] = useState("");
  const [mapping, setMapping] = useState<MappingRow[]>([]);
  const [externalIdColumn, setExternalIdColumn] = useState("");

  // A pasted file plus a reviewed column mapping is real work — and the AI
  // mapping cost a model call to produce. Losing it to a stray reload is worse
  // than the reload.
  useUnsavedChanges(csv.trim().length > 0);
  const [unmapped, setUnmapped] = useState<{ column: string; reason: string }[]>([]);
  const [entityFields, setEntityFields] = useState<EntityField[]>([]);
  const [aiMapping, setAiMapping] = useState(false);
  const [running, setRunning] = useState<false | "dry" | "live">(false);
  const [result, setResult] = useState<(ImportResult & { dryRun: boolean }) | null>(null);

  const { headers, rowCount } = csvPreview(csv);
  const mappedCount = mapping.filter((m) => m.field).length;

  async function loadFields(entityName: string) {
    setEntity(entityName);
    if (!entityName) {
      setEntityFields([]);
      return;
    }
    try {
      const schema = await api.getSchema(entityName);
      setEntityFields(schema.fields as EntityField[]);
    } catch {
      setEntityFields([]);
    }
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      setCsv(String(reader.result ?? ""));
      setFileName(file.name);
      setResult(null);
      setMapping([]);
    };
    reader.readAsText(file);
  }

  async function handleAiMap() {
    setAiMapping(true);
    setResult(null);
    try {
      const draft = await api.csvMap(csv, entity || undefined);
      await loadFields(draft.entity);
      const proposed = new Map(draft.mapping.map((m) => [m.column, m.field]));
      setMapping(headers.map((column) => ({ column, field: proposed.get(column) ?? "" })));
      setExternalIdColumn(draft.externalIdColumn ?? "");
      setUnmapped(draft.unmapped);
      toast({
        title: `Mapped ${draft.mapping.length} of ${headers.length} columns to ${draft.entity}`,
        description: draft.unmapped.length > 0 ? `${draft.unmapped.length} left unmapped — review below.` : undefined,
      });
    } catch (err) {
      toast({ title: "AI mapping failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setAiMapping(false);
    }
  }

  function startManualMapping() {
    setMapping(headers.map((column) => ({ column, field: "" })));
    setUnmapped([]);
    setResult(null);
  }

  async function runImport(dryRun: boolean) {
    const activeMapping = mapping.filter((m) => m.field);
    if (!entity || activeMapping.length === 0) {
      toast({ title: "Pick a target entity and map at least one column", variant: "destructive" });
      return;
    }
    setRunning(dryRun ? "dry" : "live");
    try {
      const res = await api.csvImport({
        csv,
        entity,
        mapping: activeMapping,
        externalIdColumn: externalIdColumn || undefined,
        sourceSystem: "csv",
        dryRun,
      });
      setResult({ ...res, dryRun });
    } catch (err) {
      toast({ title: "Import failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Import from CSV</CardTitle>
        <p className="text-sm text-muted-foreground">
          Any system's export works — ERPNext, Dolibarr, spreadsheets, even custom Odoo Studio fields. AI reads your
          columns and proposes the mapping; you stay in control.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Step 1 — the file */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label htmlFor="csv-input">1 · Your data</Label>
            <div className="flex items-center gap-2">
              {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <FileUp className="mr-1 h-3.5 w-3.5" /> Upload file
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>
          </div>
          <textarea
            id="csv-input"
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setFileName(null);
              setResult(null);
            }}
            placeholder="Paste CSV here, or upload a file…"
            rows={5}
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {headers.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {headers.length} columns · {rowCount.toLocaleString()} rows detected
            </p>
          )}
        </div>

        {/* Step 2 — mapping */}
        {headers.length > 0 && (
          <div>
            <Label className="mb-1.5 block">2 · Map columns to Meridian</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={handleAiMap} disabled={aiMapping}>
                <Sparkles className="mr-1 h-4 w-4" /> {aiMapping ? "Reading your columns…" : "Map with AI"}
              </Button>
              <Button type="button" variant="outline" onClick={startManualMapping}>
                <Wand2 className="mr-1 h-4 w-4" /> Map manually
              </Button>
              <select
                value={entity}
                onChange={(e) => loadFields(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                aria-label="Target entity"
              >
                <option value="">Target entity (AI can pick)</option>
                {entities.map((e) => (
                  <option key={e.name} value={e.name}>
                    {e.pluralLabel}
                  </option>
                ))}
              </select>
            </div>

            {mapping.length > 0 && (
              <div className="scrollbar-thin mt-3 max-h-[45vh] overflow-auto overscroll-contain rounded-lg border border-border/80">
                <table className="w-full text-sm">
                  <thead className="sticky-table-header">
                    <tr className="border-b border-border/80 bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2 text-left font-semibold">CSV column</th>
                      <th className="w-8 px-1 py-2" />
                      <th className="px-3 py-2 text-left font-semibold">Meridian field</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapping.map((row, i) => {
                      const reason = unmapped.find((u) => u.column === row.column)?.reason;
                      return (
                        <tr key={row.column} className="border-b border-border/60 last:border-0">
                          <td className="px-3 py-1.5 font-mono text-xs">{row.column}</td>
                          <td className="px-1 py-1.5 text-center text-muted-foreground">
                            <ArrowRight className="inline h-3.5 w-3.5" />
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-2">
                              <select
                                value={row.field}
                                onChange={(e) =>
                                  setMapping((prev) =>
                                    prev.map((m, j) => (j === i ? { ...m, field: e.target.value } : m)),
                                  )
                                }
                                className="h-8 min-w-40 rounded-md border border-input bg-background px-2 text-xs"
                                aria-label={`Field for column ${row.column}`}
                              >
                                <option value="">— skip —</option>
                                {entityFields.map((f) => (
                                  <option key={f.name} value={f.name}>
                                    {f.label}
                                  </option>
                                ))}
                              </select>
                              {reason && !row.field && (
                                <span className="text-xs text-muted-foreground" title={reason}>
                                  {reason}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {mapping.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-2 text-muted-foreground">
                  Re-import key
                  <select
                    value={externalIdColumn}
                    onChange={(e) => setExternalIdColumn(e.target.value)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    aria-label="External ID column"
                  >
                    <option value="">none (always create)</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="text-xs text-muted-foreground">
                  {mappedCount} of {headers.length} columns mapped
                </span>
              </div>
            )}
          </div>
        )}

        {/* Step 3 — run */}
        {mapping.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => runImport(true)} disabled={running !== false}>
              {running === "dry" ? "Checking…" : "Dry run"}
            </Button>
            <Button type="button" onClick={() => runImport(false)} disabled={running !== false}>
              {running === "live" ? "Importing…" : `Import ${rowCount.toLocaleString()} rows`}
            </Button>
          </div>
        )}

        {result && (
          <div
            className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
              result.errors.length > 0
                ? "border-amber-500/30 bg-amber-500/5"
                : "border-emerald-500/30 bg-emerald-500/5"
            }`}
            role="status"
          >
            {result.errors.length > 0 ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            )}
            <div>
              <p className="font-medium">
                {result.dryRun ? "Dry run" : "Import"} · {result.created.toLocaleString()} {result.entity} records{" "}
                {result.dryRun ? "would be imported" : "imported"}
                {result.skipped > 0 && `, ${result.skipped} skipped`}
              </p>
              {result.errors.length > 0 && (
                <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                  {result.errors.slice(0, 5).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                  {result.errors.length > 5 && <li>…and {result.errors.length - 5} more</li>}
                </ul>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
