"use client";

import { useEffect, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  Building2,
  Target,
  FolderKanban,
  CheckSquare,
  Clock,
  Flag,
  Import,
  Sparkles,
  LogOut,
  Command,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getToken, clearToken } from "@/lib/api";
import { CommandPalette } from "@/components/command-palette";
import { AiChat } from "@/components/ai-chat";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { section: "CRM" },
  { href: "/entities/contact", label: "Contacts", icon: Users },
  { href: "/entities/company", label: "Companies", icon: Building2 },
  { href: "/entities/deal", label: "Deals", icon: Target },
  { href: "/entities/activity", label: "Activities", icon: Clock },
  { section: "Projects" },
  { href: "/entities/project", label: "Projects", icon: FolderKanban },
  { href: "/entities/task", label: "Tasks", icon: CheckSquare },
  { href: "/entities/time_entry", label: "Time Entries", icon: Clock },
  { href: "/entities/milestone", label: "Milestones", icon: Flag },
  { section: "Tools" },
  { href: "/migration", label: "Import from Odoo", icon: Import },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    if (!getToken()) router.push("/");
  }, [router]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    router.push("/");
  }, [router]);

  return (
    <div className="flex h-screen">
      <aside className="flex w-64 flex-col border-r border-border bg-card">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">M</div>
          <span className="font-semibold">Meridian</span>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item, i) =>
            "section" in item ? (
              <div key={i} className="px-3 pt-4 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {item.section}
              </div>
            ) : (
              <Link
                key={item.href}
                href={item.href!}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ),
          )}
        </nav>
        <div className="border-t border-border p-3 space-y-2">
          <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => setCmdOpen(true)}>
            <Command className="h-4 w-4" /> Command palette
            <kbd className="ml-auto text-xs text-muted-foreground">⌘K</kbd>
          </Button>
          <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => setAiOpen(true)}>
            <Sparkles className="h-4 w-4" /> AI Assistant
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={logout}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
      <AiChat open={aiOpen} onOpenChange={setAiOpen} />
    </div>
  );
}
