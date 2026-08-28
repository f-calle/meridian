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
  ChevronDown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MeridianLogo } from "@/components/meridian-logo";
import { getToken, clearToken, getCurrentUser } from "@/lib/api";
import { readBrandingCache } from "@/lib/branding";
import { CommandPalette } from "@/components/command-palette";
import { AiChat } from "@/components/ai-chat";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

/**
 * Navigation.
 *
 * This was seventeen flat links, every entity given equal billing, so finding
 * anything meant reading the whole list. Three changes:
 *
 *  - The four things you do every day sit at the top with no header above them.
 *  - Everything else is grouped and collapsed; the group holding the current
 *    page opens itself, so the list you are working in is the one you can see.
 *  - Time entries and milestones are gone. They are sub-objects of a project
 *    and are reached from one — giving them top-level links padded the sidebar
 *    with rows nobody clicked.
 */
interface NavLeaf {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavLeaf[];
}

const primaryItems: NavLeaf[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/pipeline", label: "Pipeline", icon: Columns3 },
  { href: "/entities/activity", label: "Activity", icon: Clock },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

const navGroups: NavGroup[] = [
  {
    id: "customers",
    label: "Customers",
    icon: Users,
    items: [
      { href: "/entities/contact", label: "Contacts", icon: Users },
      { href: "/entities/company", label: "Companies", icon: Building2 },
      { href: "/entities/deal", label: "Deals", icon: Target },
    ],
  },
  {
    id: "revenue",
    label: "Revenue",
    icon: Receipt,
    items: [
      { href: "/entities/quote", label: "Quotes", icon: FileText },
      { href: "/entities/invoice", label: "Invoices", icon: Receipt },
      { href: "/entities/product", label: "Products", icon: Package },
    ],
  },
  {
    id: "delivery",
    label: "Delivery",
    icon: FolderKanban,
    items: [
      { href: "/entities/project", label: "Projects", icon: FolderKanban },
      { href: "/entities/task", label: "Tasks", icon: CheckSquare },
    ],
  },
];

const footerItems: NavLeaf[] = [
  { href: "/automations", label: "Automations", icon: Sparkles },
  { href: "/migration", label: "Import data", icon: Import },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const linkClass = (active: boolean) =>
  cn(
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors touch-manipulation",
    active
      ? "border-l-2 border-primary bg-primary/10 pl-[10px] font-medium text-primary"
      : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
  );

function NavLeafLink({
  item,
  pathname,
  onNavigate,
  indented,
}: {
  item: NavLeaf;
  pathname: string;
  onNavigate?: () => void;
  indented?: boolean;
}) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(linkClass(active), indented && !active && "pl-9", indented && active && "pl-[34px]")}
    >
      {!indented && <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
      {item.label}
    </Link>
  );
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  // A group containing the current page starts open, so you can always see
  // where you are without hunting. Anything the user opens by hand stays open.
  const [manuallyOpen, setManuallyOpen] = useState<Record<string, boolean>>({});

  return (
    <>
      {primaryItems.map((item) => (
        <NavLeafLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
      ))}

      <div className="pt-2" />

      {navGroups.map((group) => {
        const containsCurrent = group.items.some((item) => isActive(pathname, item.href));
        const open = manuallyOpen[group.id] ?? containsCurrent;
        return (
          <div key={group.id}>
            <button
              type="button"
              onClick={() => setManuallyOpen((state) => ({ ...state, [group.id]: !open }))}
              aria-expanded={open}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors touch-manipulation",
                containsCurrent && !open
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
              )}
            >
              <group.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {group.label}
              <ChevronDown
                className={cn(
                  "ml-auto h-3.5 w-3.5 shrink-0 transition-transform duration-150 motion-reduce:transition-none",
                  open ? "rotate-0" : "-rotate-90",
                )}
                aria-hidden="true"
              />
            </button>
            {open && (
              <div className="mt-0.5 space-y-0.5">
                {group.items.map((item) => (
                  <NavLeafLink
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    onNavigate={onNavigate}
                    indented
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div className="pt-2" />

      {footerItems.map((item) => (
        <NavLeafLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
      ))}
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
    <div className="mt-auto space-y-1.5 border-t border-border/80 p-3">
      <button
        type="button"
        onClick={onCommandPalette}
        className="flex w-full items-center gap-2 rounded-md border border-border/80 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/40 touch-manipulation"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Search everything…</span>
        <kbd className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] opacity-70">⌘&nbsp;K</kbd>
      </button>
      <button
        type="button"
        onClick={onAiOpen}
        className="flex w-full items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15 touch-manipulation"
      >
        <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
        Ask Meridian
      </button>
      {/* Theme and sign-out are one-tap switches, not destinations — an icon
          row keeps them reachable without spending two more sidebar lines. */}
      <div className="flex items-center gap-1 pt-0.5">
        <ThemeToggle className="h-8 w-8 justify-center p-0 touch-manipulation" iconOnly />
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-8 gap-2 px-2 text-muted-foreground touch-manipulation"
          onClick={onLogout}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
        </Button>
      </div>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // A tenant that uploaded its own logo should not see "MERIDIAN" beside it.
  const [workspaceName, setWorkspaceName] = useState("Meridian");
  useEffect(() => {
    const branded = Boolean(readBrandingCache()?.logo);
    const tenant = getCurrentUser()?.tenantName;
    if (branded && tenant) setWorkspaceName(tenant);
  }, []);

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
          <span className="truncate font-bold tracking-tight">{workspaceName}</span>
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
