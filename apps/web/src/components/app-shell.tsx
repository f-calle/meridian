"use client";

import { useEffect, useCallback, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
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
  Search,
  Menu,
  Columns3,
  BarChart3,
  Settings as SettingsIcon,
  FileText,
  Receipt,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MeridianLogo } from "@/components/meridian-logo";
import { getToken, clearToken } from "@/lib/api";
import { CommandPalette } from "@/components/command-palette";
import { AiChat } from "@/components/ai-chat";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { section: "CRM" },
  { href: "/entities/contact", label: "Contacts", icon: Users },
  { href: "/entities/company", label: "Companies", icon: Building2 },
  { href: "/entities/deal", label: "Deals", icon: Target },
  { href: "/entities/quote", label: "Quotes", icon: FileText },
  { href: "/entities/invoice", label: "Invoices", icon: Receipt },
  { href: "/entities/product", label: "Products", icon: Package },
  { href: "/pipeline", label: "Pipeline", icon: Columns3 },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/entities/activity", label: "Activities", icon: Clock },
  { section: "Projects" },
  { href: "/entities/project", label: "Projects", icon: FolderKanban },
  { href: "/entities/task", label: "Tasks", icon: CheckSquare },
  { href: "/entities/time_entry", label: "Time Entries", icon: Clock },
  { href: "/entities/milestone", label: "Milestones", icon: Flag },
  { section: "Tools" },
  { href: "/automations", label: "Automations", icon: Sparkles },
  { href: "/migration", label: "Import from Odoo", icon: Import },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {navItems.map((item, i) =>
        "section" in item ? (
          <div
            key={i}
            className="select-none px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            aria-hidden="true"
          >
            {item.section}
          </div>
        ) : (
          <Link
            key={item.href}
            href={item.href!}
            onClick={onNavigate}
            aria-current={pathname === item.href || pathname.startsWith(`${item.href}/`) ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors touch-manipulation",
              pathname === item.href || pathname.startsWith(`${item.href}/`)
                ? "border-l-2 border-primary bg-primary/10 pl-[10px] font-medium text-primary"
                : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        ),
      )}
    </>
  );
}

function SidebarFooter({
  onCommandPalette,
  onAiOpen,
  onLogout,
}: {
  onCommandPalette: () => void;
  onAiOpen: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="mt-auto space-y-1 border-t border-border/80 p-4">
      <ThemeToggle className="w-full justify-start gap-2 touch-manipulation" />
      <button
        type="button"
        onClick={onCommandPalette}
        className="flex w-full items-center gap-2 rounded-md border border-border/80 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/40 touch-manipulation"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Quick search…</span>
        <kbd className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] opacity-70">⌘&nbsp;K</kbd>
      </button>
      <button
        type="button"
        onClick={onAiOpen}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/5 touch-manipulation"
      >
        <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
        Ask Meridian AI
      </button>
      <Button variant="ghost" size="sm" className="w-full justify-start gap-2 touch-manipulation" onClick={onLogout}>
        <LogOut className="h-4 w-4" aria-hidden="true" /> Sign Out
      </Button>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="glass-sidebar hidden w-[260px] shrink-0 flex-col md:flex">
        <div className="flex h-14 items-center gap-3 border-b border-border/80 px-6">
          <MeridianLogo size="sm" />
          <span className="font-bold tracking-tight">MERIDIAN</span>
        </div>
        <nav className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto overscroll-contain p-4" aria-label="Main navigation">
          <NavLinks pathname={pathname} />
        </nav>
        <SidebarFooter
          onCommandPalette={() => setCmdOpen(true)}
          onAiOpen={() => setAiOpen(true)}
          onLogout={logout}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/80 bg-card/30 px-4 backdrop-blur-md md:hidden">
          <Button
            variant="outline"
            size="icon"
            className="touch-manipulation"
            aria-label="Open navigation menu"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <MeridianLogo size="sm" />
          <span className="font-semibold">Meridian</span>
        </header>

        <main id="main-content" className="scrollbar-thin flex-1 overflow-y-auto overscroll-contain">
          {children}
        </main>
      </div>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <MeridianLogo size="sm" /> Meridian
            </SheetTitle>
          </SheetHeader>
          <nav className="flex-1 space-y-1 overflow-y-auto overscroll-contain p-3" aria-label="Mobile navigation">
            <NavLinks pathname={pathname} onNavigate={() => setMobileNavOpen(false)} />
          </nav>
          <SidebarFooter
            onCommandPalette={() => {
              setMobileNavOpen(false);
              setCmdOpen(true);
            }}
            onAiOpen={() => {
              setMobileNavOpen(false);
              setAiOpen(true);
            }}
            onLogout={logout}
          />
        </SheetContent>
      </Sheet>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
      <AiChat open={aiOpen} onOpenChange={setAiOpen} />
    </div>
  );
}
