"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";

type Field = {
  name: string;
  type: string;
  label: string;
  required?: boolean;
  options?: string[];
};

export default function EntityListPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const entity = params.entity as string;

  const urlSearch = searchParams.get("q") ?? "";
  const [searchInput, setSearchInput] = useState(urlSearch);
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [schema, setSchema] = useState<{ label: string; pluralLabel: string; fields: Field[] } | null>(null);
  const [total, setTotal] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = searchInput.trim();
      if (trimmed) params.set("q", trimmed);
      else params.delete("q");
      const next = params.toString();
      const current = searchParams.toString();
      if (next !== current) {
        router.replace(next ? `?${next}` : "?", { scroll: false });
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, router, searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listResult, schemaResult] = await Promise.all([
        api.list(entity, { search: urlSearch || undefined }),
        api.getSchema(entity),
      ]);
      setRecords(listResult.data);
      setTotal(listResult.total);
      setSchema(schemaResult);
    } catch (err) {
      toast({
        title: "Failed to load records",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [entity, urlSearch, toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const payload: Record<string, unknown> = { ...formData };
      for (const field of schema?.fields ?? []) {
        const value = payload[field.name];
        if (field.type === "json" && typeof value === "string" && value.trim() !== "") {
          try {
            payload[field.name] = JSON.parse(value);
          } catch {
            toast({
              title: "Invalid JSON",
              description: `${field.label} must be valid JSON.`,
              variant: "destructive",
            });
            return;
          }
        } else if (field.type === "json" && (value === "" || value === undefined)) {
          delete payload[field.name];
        }
      }
      await api.create(entity, payload);
      setShowForm(false);
      setFormData({});
      load();
      toast({ title: `${schema?.label ?? "Record"} created` });
    } catch (err) {
      toast({
        title: "Create failed",
        description: (err as Error).message,
        variant: "destructive",
      });
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(entity, deleteTarget.id);
      setDeleteTarget(null);
      load();
      toast({ title: "Record deleted" });
    } catch (err) {
      toast({
        title: "Delete failed",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  const displayFields = useMemo(
    () => schema?.fields.filter((f) => f.type !== "text" && f.type !== "json").slice(0, 4) ?? [],
    [schema],
  );

  function recordLabel(record: Record<string, unknown>): string {
    const name = record.name ?? record.title ?? record.label ?? record.id;
    return name ? String(name) : "this record";
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{schema?.pluralLabel ?? entity}</h1>
          <p className="text-sm text-muted-foreground tabular-nums">{loading ? "Loading…" : `${total} records`}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              className="w-full pl-9 sm:w-64"
              placeholder="Search…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label={`Search ${schema?.pluralLabel ?? "records"}`}
              autoComplete="off"
              name="entity-search"
            />
          </div>
          <Button onClick={() => setShowForm(true)} className="touch-manipulation">
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> New
          </Button>
        </div>
      </div>

      {showForm && schema && (
        <Card className="mb-6 border-border/80 shadow-elevated">
          <CardHeader>
            <CardTitle className="text-lg">New {schema.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {schema.fields.map((field) => (
                <div key={field.name} className={field.type === "text" || field.type === "json" ? "md:col-span-2" : ""}>
                  <Label htmlFor={field.name}>{field.label}</Label>
                  {field.type === "json" ? (
                    <textarea
                      id={field.name}
                      name={field.name}
                      className="mt-1.5 flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      placeholder='JSON, e.g. [{"field": "stage", "op": "eq", "value": "won"}]…'
                      value={(formData[field.name] as string) ?? ""}
                      onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                    />
                  ) : field.type === "select" ? (
                    <select
                      id={field.name}
                      name={field.name}
                      className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={(formData[field.name] as string) ?? ""}
                      onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                      required={field.required}
                    >
                      <option value="">Select…</option>
                      {field.options?.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  ) : field.type === "boolean" ? (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={field.name}
                        name={field.name}
                        checked={(formData[field.name] as boolean) ?? false}
                        onChange={(e) => setFormData({ ...formData, [field.name]: e.target.checked })}
                        className="h-4 w-4 rounded border-input"
                      />
                      <Label htmlFor={field.name} className="font-normal text-muted-foreground">
                        Enable {field.label.toLowerCase()}
                      </Label>
                    </div>
                  ) : (
                    <Input
                      id={field.name}
                      name={field.name}
                      className="mt-1.5"
                      type={field.type === "number" || field.type === "currency" ? "number" : field.type === "date" ? "date" : "text"}
                      value={(formData[field.name] as string) ?? ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          [field.name]:
                            field.type === "number" || field.type === "currency" ? Number(e.target.value) : e.target.value,
                        })
                      }
                      required={field.required}
                    />
                  )}
                </div>
              ))}
              <div className="flex gap-2 md:col-span-2">
                <Button type="submit" className="touch-manipulation">Create</Button>
                <Button type="button" variant="outline" className="touch-manipulation" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="overflow-hidden rounded-lg border border-border/80">
          <div className="space-y-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-4 border-b border-border/80 px-4 py-3 last:border-0">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="ml-auto h-4 w-8" />
              </div>
            ))}
          </div>
        </div>
      ) : records.length === 0 ? (
        <Card className="border-border/80 shadow-elevated">
          <CardContent className="py-16 text-center">
            <p className="mb-4 text-muted-foreground">
              {urlSearch
                ? `No ${schema?.pluralLabel?.toLowerCase() ?? "records"} match your search`
                : `No ${schema?.pluralLabel?.toLowerCase() ?? "records"} yet`}
            </p>
            {!urlSearch && (
              <Button onClick={() => setShowForm(true)} className="touch-manipulation">
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                Create Your First {schema?.label ?? "Record"}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/80 shadow-elevated">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {displayFields.map((f) => (
                  <TableHead key={f.name}>{f.label}</TableHead>
                ))}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id as string}>
                  {displayFields.map((f) => (
                    <TableCell key={f.name} className="max-w-[200px] truncate">
                      {formatValue(record[f.name], f.type)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 touch-manipulation" aria-label="Row actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() =>
                            setDeleteTarget({ id: record.id as string, label: recordLabel(record) })
                          }
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {schema?.label ?? "Record"}?</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{deleteTarget?.label}</strong>. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting} className="touch-manipulation">
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatValue(value: unknown, type?: string): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (type === "currency") {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
    }
    return value.toLocaleString();
  }
  return String(value);
}
