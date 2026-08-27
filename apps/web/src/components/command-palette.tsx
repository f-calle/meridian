"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { BarChart3, Columns3, Import, LayoutDashboard, Settings, Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { recordLabel } from "@/lib/entity-ui";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface EntityMeta {
  name: string;
  label: string;
  pluralLabel: string;
}

interface Hit {
  id: string;
  entity: string;
  entityLabel: string;
  label: string;
  detail?: string;
}

/** Entities worth searching by default, in the order results should appear. */
const SEARCHABLE = ["contact", "company", "deal", "project", "task", "quote", "invoice", "product"];

const PAGES = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Pipeline", href: "/pipeline", icon: Columns3 },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Automations", href: "/automations", icon: Zap },
  { label: "Import data", href: "/migration", icon: Import },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const [entities, setEntities] = useState<EntityMeta[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  // Guards against a slow earlier query overwriting a newer one's results
  const requestRef = useRef(0);

  useEffect(() => {
    if (open) {
      api.getEntities().then((r) => setEntities(r.entities)).catch(() => {});
    } else {
      setQuery("");
      setHits([]);
    }
  }, [open]);

  const labelFor = useMemo(
    () => (name: string) => entities.find((e) => e.name === name)?.label ?? name,
    [entities],
  );

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const requestId = ++requestRef.current;
    const timer = window.setTimeout(async () => {
      const targets = SEARCHABLE.filter((name) => entities.some((e) => e.name === name));
      const results = await Promise.all(
        targets.map(async (name) => {
          try {
            const res = await api.list(name, { search: term, pageSize: 5 });
            return res.data.map((r) => ({
              id: String(r.id),
              entity: name,
              entityLabel: labelFor(name),
              label: recordLabel(r),
              detail: [r.email, r.status, r.stage, r.number].filter(Boolean).map(String)[0],
            }));
          } catch {
            return [] as Hit[];
          }
        }),
      );
      if (requestRef.current !== requestId) return; // a newer search won
      setHits(results.flat());
      setSearching(false);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query, entities, labelFor]);

  function navigate(path: string) {
    router.push(path);
    onOpenChange(false);
  }

  const itemClass =
    "flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm aria-selected:bg-accent touch-manipulation";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-lg" aria-describedby="command-palette-desc">
        <DialogHeader className="sr-only">
          <DialogTitle>Command Palette</DialogTitle>
          <DialogDescription id="command-palette-desc">
            Search your records or jump to any page
          </DialogDescription>
        </DialogHeader>
        <Command className="overflow-hidden" label="Command palette" shouldFilter={false}>
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Search contacts, deals, invoices… or jump to a page"
            className="flex h-12 w-full border-b border-border/80 bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Command.List className="max-h-96 overflow-y-auto overscroll-contain p-2">
            {query.trim().length >= 2 && (
              <Command.Group heading={searching ? "Searching…" : `Records (${hits.length})`}>
                {hits.map((hit) => (
                  <Command.Item
                    key={`${hit.entity}-${hit.id}`}
                    value={`${hit.entity}-${hit.id}`}
                    className={itemClass}
                    onSelect={() => navigate(`/entities/${hit.entity}/${hit.id}`)}
                  >
                    <span className="truncate">{hit.label}</span>
                    {hit.detail && (
                      <span className="truncate text-xs text-muted-foreground">{hit.detail}</span>
                    )}
                    <span className="ml-auto shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {hit.entityLabel}
                    </span>
                  </Command.Item>
                ))}
                {!searching && hits.length === 0 && (
                  <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                    Nothing matches “{query.trim()}”.
                  </p>
                )}
              </Command.Group>
            )}

            <Command.Group heading="Go to">
              {PAGES.filter((p) => p.label.toLowerCase().includes(query.trim().toLowerCase())).map((page) => (
                <Command.Item
                  key={page.href}
                  value={page.href}
                  className={itemClass}
                  onSelect={() => navigate(page.href)}
                >
                  <page.icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {page.label}
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading="Lists">
              {entities
                .filter((e) => e.pluralLabel.toLowerCase().includes(query.trim().toLowerCase()))
                .map((e) => (
                  <Command.Item
                    key={e.name}
                    value={`list-${e.name}`}
                    className={itemClass}
                    onSelect={() => navigate(`/entities/${e.name}`)}
                  >
                    All {e.pluralLabel}
                  </Command.Item>
                ))}
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
