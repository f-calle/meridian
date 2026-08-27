"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { api } from "@/lib/api";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const [entities, setEntities] = useState<{ name: string; label: string; pluralLabel: string }[]>([]);

  useEffect(() => {
    if (open) {
      api.getEntities().then((r) => setEntities(r.entities)).catch(() => {});
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50" onClick={() => onOpenChange(false)}>
      <div className="fixed left-1/2 top-1/4 -translate-x-1/2 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <Command className="rounded-lg border border-border bg-card shadow-2xl overflow-hidden">
          <Command.Input
            placeholder="Search entities, navigate..."
            className="w-full px-4 py-3 text-sm bg-transparent border-b border-border outline-none placeholder:text-muted-foreground"
          />
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">No results found.</Command.Empty>
            <Command.Group heading="Navigate">
              <Command.Item
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm cursor-pointer aria-selected:bg-accent"
                onSelect={() => { router.push("/dashboard"); onOpenChange(false); }}
              >
                Dashboard
              </Command.Item>
              <Command.Item
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm cursor-pointer aria-selected:bg-accent"
                onSelect={() => { router.push("/migration"); onOpenChange(false); }}
              >
                Import from Odoo
              </Command.Item>
            </Command.Group>
            <Command.Group heading="Entities">
              {entities.map((e) => (
                <Command.Item
                  key={e.name}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm cursor-pointer aria-selected:bg-accent"
                  onSelect={() => { router.push(`/entities/${e.name}`); onOpenChange(false); }}
                >
                  {e.pluralLabel}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
