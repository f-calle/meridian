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
  Command,
  Menu,
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
  { href: "/entities/activity", label: "Activities", icon: Clock },
  { section: "Projects" },
  { href: "/entities/project", label: "Projects", icon: FolderKanban },
  { href: "/entities/task", label: "Tasks", icon: CheckSquare },
  { href: "/entities/time_entry", label: "Time Entries", icon: Clock },
  { href: "/entities/milestone", label: "Milestones", icon: Flag },
  { section: "Tools" },
  { href: "/migration", label: "Import from Odoo", icon: Import },
];

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {navItems.map((item, i) =>
        "section" in item ? (
          <div key={i} className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {item.section}
          </div>
        ) : (
          <Link
            key={item.href}
            href={item.href!}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors touch-manipulation",
              pathname === item.href || pathname.startsWith(`${item.href}/`)
                ? "border-l-2 border-primary bg-primary/10 pl-[10px] font-medium text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
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
    <div className="space-y-2 border-t border-border/80 p-3">
      <ThemeToggle className="w-full justify-start gap-2 touch-manipulation" />
      <Button variant="outline" size="sm" className="w-full justify-start gap-2 touch-manipulation" onClick={onCommandPalette}>
        <Command className="h-4 w-4" aria-hidden="true" /> Command Palette
        <kbd className="ml-auto text-xs text-muted-foreground">⌘&nbsp;K</kbd>
      </Button>
      <Button variant="outline" size="sm" className="w-full justify-start gap-2 touch-manipulation" onClick={onAiOpen}>
        <Sparkles className="h-4 w-4" aria-hidden="true" /> AI Assistant
      </Button>
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
    <div className="flex h-screen overflow-hidden">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border/80 bg-card md:flex">
        <div className="flex h-14 items-center gap-3 border-b border-border/80 px-4">
          <MeridianLogo size="sm" />
          <span className="font-semibold tracking-tight">Meridian</span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto overscroll-contain p-3" aria-label="Main navigation">
          <NavLinks pathname={pathname} />
        </nav>
        <SidebarFooter
          onCommandPalette={() => setCmdOpen(true)}
          onAiOpen={() => setAiOpen(true)}
          onLogout={logout}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/80 bg-card px-4 md:hidden">
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

        <main id="main-content" className="flex-1 overflow-y-auto overscroll-contain">
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
