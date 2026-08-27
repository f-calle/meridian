"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, X } from "lucide-react";
import { api } from "@/lib/api";
import { recordLabel } from "@/lib/entity-ui";

/** Session-scoped cache of record labels, keyed by `${entity}:${id}`. */
const labelCache = new Map<string, string>();
const pendingLookups = new Map<string, Promise<string>>();

async function lookupLabel(entity: string, id: string): Promise<string> {
  const key = `${entity}:${id}`;
  const cached = labelCache.get(key);
  if (cached) return cached;
  const pending = pendingLookups.get(key);
  if (pending) return pending;

  const promise = api
    .read(entity, id)
    .then((record) => {
      const label = recordLabel(record);
      labelCache.set(key, label);
      return label;
    })
    .catch(() => id.slice(0, 8))
    .finally(() => pendingLookups.delete(key));
  pendingLookups.set(key, promise);
  return promise;
}

/** Renders a related record's human-readable label (linked), from a cached lookup. */
export function RelationLabel({
  entity,
  id,
  link = true,
}: {
  entity: string;
  id: string | null | undefined;
  link?: boolean;
}) {
  const [label, setLabel] = useState<string | null>(id ? labelCache.get(`${entity}:${id}`) ?? null : null);

  useEffect(() => {
    let cancelled = false;
    if (id) {
      lookupLabel(entity, id).then((l) => {
        if (!cancelled) setLabel(l);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [entity, id]);

  if (!id) return <span className="text-muted-foreground">—</span>;
  if (label === null) return <span className="text-muted-foreground">…</span>;
  if (!link) return <span>{label}</span>;
  return (
    <Link
      href={`/entities/${entity}/${id}`}
      className="text-primary underline-offset-2 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {label}
    </Link>
  );
}

interface RelationPickerProps {
  entity: string;
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  required?: boolean;
  id?: string;
}

/** Searchable async picker for relation fields — no raw UUIDs. */
export function RelationPicker({ entity, value, onChange, required, id }: RelationPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (value) {
      lookupLabel(entity, value).then((l) => {
        if (!cancelled) setSelectedLabel(l);
      });
    } else {
      setSelectedLabel(null);
    }
    return () => {
      cancelled = true;
    };
  }, [entity, value]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await api.list(entity, { search: query.trim() || undefined });
        const opts = result.data.map((r) => {
          const label = recordLabel(r);
          labelCache.set(`${entity}:${String(r.id)}`, label);
          return { id: String(r.id), label };
        });
        setOptions(opts);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [open, query, entity]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative mt-1.5">
      <button
        type="button"
        id={id}
        onClick={() => {
          setOpen((o) => !o);
          setQuery("");
        }}
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={value ? "" : "text-muted-foreground"}>
          {value ? selectedLabel ?? "…" : `Select a ${entity}…`}
        </span>
        <span className="flex items-center gap-1">
          {value && !required && (
            <X
              className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
                setOpen(false);
              }}
              aria-label="Clear selection"
            />
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${entity}s…`}
            className="w-full border-b border-border bg-transparent px-3 py-2 text-sm focus:outline-none"
            aria-label={`Search ${entity} records`}
          />
          <ul role="listbox" className="max-h-56 overflow-y-auto py-1">
            {loading ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">Searching…</li>
            ) : options.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">No matches</li>
            ) : (
              options.map((opt) => (
                <li
                  key={opt.id}
                  role="option"
                  aria-selected={opt.id === value}
                  onClick={() => {
                    onChange(opt.id);
                    setOpen(false);
                  }}
                  className={`cursor-pointer px-3 py-2 text-sm hover:bg-muted ${opt.id === value ? "bg-muted font-medium" : ""}`}
                >
                  {opt.label}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
