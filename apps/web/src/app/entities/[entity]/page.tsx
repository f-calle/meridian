"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, Search, MoreHorizontal, Trash2, Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination";
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
import { EntityFormFields } from "@/components/entity-form-fields";
import { useToast } from "@/components/ui/toast";
import { usePageTitle } from "@/hooks/use-page-title";
import { api } from "@/lib/api";
import { formatFieldValue, recordLabel, type EntityField } from "@/lib/entity-ui";

const PAGE_SIZE = 20;

export default function EntityListPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const entity = params.entity as string;

  const urlSearch = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const [searchInput, setSearchInput] = useState(urlSearch);
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [schema, setSchema] = useState<{ label: string; pluralLabel: string; fields: EntityField[] } | null>(null);
  const [total, setTotal] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  usePageTitle(schema?.pluralLabel ?? entity);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, urlSearch, entity]);

  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const trimmed = searchInput.trim();
      // Only touch the URL when the search text actually changed — otherwise
      // this effect (re-run on any searchParams change) wipes the page param.
      if (trimmed === (searchParams.get("q") ?? "")) return;
      const nextParams = new URLSearchParams(searchParams.toString());
      if (trimmed) nextParams.set("q", trimmed);
      else nextParams.delete("q");
      nextParams.delete("page");
      const next = nextParams.toString();
      router.replace(next ? `?${next}` : "?", { scroll: false });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, router, searchParams]);

  const setPage = useCallback(
    (nextPage: number) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      if (nextPage <= 1) nextParams.delete("page");
      else nextParams.set("page", String(nextPage));
      router.replace(`?${nextParams.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listResult, schemaResult] = await Promise.all([
        api.list(entity, { search: urlSearch || undefined, page }),
        api.getSchema(entity),
      ]);
      setRecords(listResult.data);
      setTotal(listResult.total);
      setSchema(schemaResult);
      // Deleting the tail of the last page can leave us beyond the end —
      // snap back to the last page that still has records.
      if (listResult.data.length === 0 && page > 1) {
        setPage(Math.max(1, Math.ceil(listResult.total / PAGE_SIZE)));
      }
    } catch (err) {
      toast({
        title: "Failed to load records",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [entity, urlSearch, page, toast, setPage]);

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
      const created = await api.create(entity, payload);
      setShowForm(false);
      setFormData({});
      toast({ title: `${schema?.label ?? "Record"} created` });
      if (created.id) {
        router.push(`/entities/${entity}/${created.id}`);
      } else {
        load();
      }
    } catch (err) {
      toast({
        title: "Create failed",
        description: (err as Error).message,
        variant: "destructive",
      });
    }
  }

  async function confirmBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    try {
      const result = await api.bulkDelete(entity, ids);
      setBulkDeleteOpen(false);
      setSelectedIds(new Set());
      load();
      if (result.failed.length === 0) {
        toast({ title: `Deleted ${result.deleted.length} records` });
      } else {
        toast({
          title: `Deleted ${result.deleted.length} of ${ids.length} records`,
          description: `${result.failed.length} could not be deleted.`,
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Bulk delete failed",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setBulkDeleting(false);
    }
  }

  const pageRecordIds = useMemo(() => records.map((r) => String(r.id)), [records]);
  const allPageSelected = pageRecordIds.length > 0 && pageRecordIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  function toggleSelectAll() {
    if (allPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageRecordIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => new Set([...prev, ...pageRecordIds]));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{schema?.pluralLabel ?? entity}</h1>
          <p className="text-sm text-muted-foreground tabular-nums">{loading ? "Loading…" : `${total.toLocaleString()} records`}</p>
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
              <EntityFormFields fields={schema.fields} formData={formData} onChange={setFormData} />
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
        <>
          {someSelected && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
              <span className="text-sm font-medium tabular-nums">{selectedIds.size} selected</span>
              <div className="hidden h-4 w-px bg-primary/30 sm:block" aria-hidden="true" />
              <Button
                variant="destructive"
                size="sm"
                className="touch-manipulation"
                onClick={() => setBulkDeleteOpen(true)}
              >
                <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
                Delete Selected
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto touch-manipulation sm:ml-0"
                onClick={() => setSelectedIds(new Set())}
                aria-label="Clear selection"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          <div className="overflow-hidden rounded-xl border border-border/80 shadow-layered">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectAll}
                      aria-label="Select all on this page"
                      className="h-4 w-4 rounded border-input"
                    />
                  </TableHead>
                  {displayFields.map((f) => (
                    <TableHead key={f.name}>{f.label}</TableHead>
                  ))}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => {
                  const recordId = String(record.id);
                  return (
                  <TableRow
                    key={recordId}
                    className={selectedIds.has(recordId) ? "cursor-pointer bg-primary/5" : "cursor-pointer"}
                    onClick={() => router.push(`/entities/${entity}/${record.id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(recordId)}
                        onChange={() => toggleSelect(recordId)}
                        aria-label={`Select ${recordLabel(record)}`}
                        className="h-4 w-4 rounded border-input"
                      />
                    </TableCell>
                    {displayFields.map((f) => (
                      <TableCell key={f.name} className="max-w-[200px] truncate">
                        {formatFieldValue(record[f.name], f.type)}
                      </TableCell>
                    ))}
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 touch-manipulation" aria-label="Row actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/entities/${entity}/${record.id}`} className="flex items-center gap-2">
                              <Eye className="h-4 w-4" aria-hidden="true" />
                              View Details
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() =>
                              setDeleteTarget({ id: recordId, label: recordLabel(record) })
                            }
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} className="mt-4" />
        </>
      )}

      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedIds.size} {schema?.pluralLabel?.toLowerCase() ?? "records"}?</DialogTitle>
            <DialogDescription>
              This will permanently delete {selectedIds.size} selected records. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmBulkDelete} disabled={bulkDeleting} className="touch-manipulation">
              {bulkDeleting ? "Deleting…" : `Delete ${selectedIds.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
