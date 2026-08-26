"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, Search, Trash2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

export default function EntityListPage() {
  const params = useParams();
  const router = useRouter();
  const entity = params.entity as string;
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [schema, setSchema] = useState<{ label: string; pluralLabel: string; fields: { name: string; type: string; label: string; required?: boolean; options?: string[] }[] } | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listResult, schemaResult] = await Promise.all([
        api.list(entity, { search: search || undefined }),
        api.getSchema(entity),
      ]);
      setRecords(listResult.data);
      setTotal(listResult.total);
      setSchema(schemaResult);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [entity, search]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.create(entity, formData);
      setShowForm(false);
      setFormData({});
      load();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this record?")) return;
    try {
      await api.delete(entity, id);
      load();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  const displayFields = schema?.fields.filter((f) => f.type !== "text" && f.type !== "json").slice(0, 4) ?? [];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{schema?.pluralLabel ?? entity}</h1>
          <p className="text-sm text-muted-foreground">{total} records</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 w-64"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1" /> New
          </Button>
        </div>
      </div>

      {showForm && schema && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">New {schema.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
              {schema.fields.filter((f) => f.type !== "json").map((field) => (
                <div key={field.name} className={field.type === "text" ? "col-span-2" : ""}>
                  <Label htmlFor={field.name}>{field.label}</Label>
                  {field.type === "select" ? (
                    <select
                      id={field.name}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={(formData[field.name] as string) ?? ""}
                      onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                      required={field.required}
                    >
                      <option value="">Select...</option>
                      {field.options?.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  ) : field.type === "boolean" ? (
                    <input
                      type="checkbox"
                      id={field.name}
                      checked={(formData[field.name] as boolean) ?? false}
                      onChange={(e) => setFormData({ ...formData, [field.name]: e.target.checked })}
                      className="mt-2"
                    />
                  ) : (
                    <Input
                      id={field.name}
                      type={field.type === "number" || field.type === "currency" ? "number" : field.type === "date" ? "date" : "text"}
                      value={(formData[field.name] as string) ?? ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          [field.name]: field.type === "number" || field.type === "currency" ? Number(e.target.value) : e.target.value,
                        })
                      }
                      required={field.required}
                    />
                  )}
                </div>
              ))}
              <div className="col-span-2 flex gap-2">
                <Button type="submit">Create</Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : records.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No {schema?.pluralLabel?.toLowerCase() ?? "records"} yet</p>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-1" /> Create your first {schema?.label?.toLowerCase() ?? "record"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {displayFields.map((f) => (
                  <th key={f.name} className="px-4 py-3 text-left font-medium text-muted-foreground">{f.label}</th>
                ))}
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id as string} className="border-b border-border hover:bg-muted/30 transition-colors">
                  {displayFields.map((f) => (
                    <td key={f.name} className="px-4 py-3">
                      {formatValue(record[f.name])}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(record.id as string)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}
