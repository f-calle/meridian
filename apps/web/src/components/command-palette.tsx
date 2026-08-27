"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

  function navigate(path: string) {
    router.push(path);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-lg" aria-describedby="command-palette-desc">
        <DialogHeader className="sr-only">
          <DialogTitle>Command Palette</DialogTitle>
          <DialogDescription id="command-palette-desc">Search entities and navigate Meridian</DialogDescription>
        </DialogHeader>
        <Command
          className="overflow-hidden"
          label="Command palette"
        >
          <Command.Input
            placeholder="Search entities, navigate…"
            className="flex h-12 w-full border-b border-border/80 bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Command.List className="max-h-80 overflow-y-auto overscroll-contain p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">No results found.</Command.Empty>
            <Command.Group heading="Navigate">
              <Command.Item
                className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm aria-selected:bg-accent touch-manipulation"
                onSelect={() => navigate("/dashboard")}
              >
                Dashboard
              </Command.Item>
              <Command.Item
                className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm aria-selected:bg-accent touch-manipulation"
                onSelect={() => navigate("/migration")}
              >
                Import from Odoo
              </Command.Item>
            </Command.Group>
            <Command.Group heading="Entities">
              {entities.map((e) => (
                <Command.Item
                  key={e.name}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm aria-selected:bg-accent touch-manipulation"
                  onSelect={() => navigate(`/entities/${e.name}`)}
                >
                  {e.pluralLabel}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
