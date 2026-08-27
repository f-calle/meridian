"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Pencil, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { EntityFormFields } from "@/components/entity-form-fields";
import { useToast } from "@/components/ui/toast";
import { usePageTitle } from "@/hooks/use-page-title";
import { api } from "@/lib/api";
import { recordLabel, recordTitle, type EntityField } from "@/lib/entity-ui";

export default function EntityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const entity = params.entity as string;
  const id = params.id as string;

  const [schema, setSchema] = useState<{ label: string; pluralLabel: string; fields: EntityField[] } | null>(null);
  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const pageTitle = record && schema ? recordTitle(record, schema.label) : schema?.label ?? "Record";
  usePageTitle(pageTitle);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [schemaResult, recordResult] = await Promise.all([
        api.getSchema(entity),
        api.read(entity, id),
      ]);
      setSchema(schemaResult);
      setRecord(recordResult);
      setFormData(recordResult);
    } catch (err) {
      toast({
        title: "Failed to load record",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [entity, id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...formData };
      delete payload.id;
      delete payload.createdAt;
      delete payload.updatedAt;
      delete payload.tenantId;

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
        }
      }

      const updated = await api.update(entity, id, payload);
      setRecord(updated);
      setFormData(updated);
      setEditing(false);
      toast({ title: "Changes saved" });
    } catch (err) {
      toast({
        title: "Save failed",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await api.delete(entity, id);
      toast({ title: "Record deleted" });
      router.push(`/entities/${entity}`);
    } catch (err) {
      toast({
        title: "Delete failed",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 md:p-8">
        <Skeleton className="mb-6 h-8 w-48" />
        <Card className="border-border/80 shadow-elevated">
          <CardContent className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!schema || !record) {
    return (
      <div className="p-6 md:p-8">
        <Button variant="ghost" asChild className="mb-4">
          <Link href={`/entities/${entity}`}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Back to {schema?.pluralLabel ?? entity}
          </Link>
        </Button>
        <Card className="border-border/80 shadow-elevated">
          <CardContent className="py-12 text-center text-muted-foreground">Record not found</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" asChild className="mt-0.5 shrink-0 touch-manipulation" aria-label={`Back to ${schema.pluralLabel}`}>
            <Link href={`/entities/${entity}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{recordTitle(record, schema.label)}</h1>
            <p className="text-sm text-muted-foreground">{schema.label} details</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!editing ? (
            <>
              <Button variant="outline" onClick={() => setEditing(true)} className="touch-manipulation">
                <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                Edit
              </Button>
              <Button variant="destructive" onClick={() => setDeleteOpen(true)} className="touch-manipulation">
                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Delete
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setFormData(record);
                  setEditing(false);
                }}
                disabled={saving}
                className="touch-manipulation"
              >
                Cancel
              </Button>
              <Button type="submit" form="entity-detail-form" disabled={saving} className="touch-manipulation">
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                    Save Changes
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      <Card className="border-border/80 shadow-elevated">
        <CardHeader>
          <CardTitle className="text-lg">{editing ? `Edit ${schema.label}` : schema.label}</CardTitle>
        </CardHeader>
        <CardContent>
          {editing ? (
            <form id="entity-detail-form" onSubmit={handleSave} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <EntityFormFields fields={schema.fields} formData={formData} onChange={setFormData} mode="edit" />
            </form>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <EntityFormFields fields={schema.fields} formData={record} onChange={() => {}} mode="view" />
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {schema.label}?</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{recordLabel(record)}</strong>. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
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
