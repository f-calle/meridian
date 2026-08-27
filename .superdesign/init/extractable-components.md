# Extractable Components

Components suitable for Superdesign DraftComponent extraction.

## AppShell

- Source: `apps/web/src/components/app-shell.tsx`
- Category: layout
- Description: Sidebar navigation with logo, CRM/Projects/Tools sections, command palette and AI assistant triggers, sign out
- Extractable props: activeHref (string, current route for nav highlight), cmdOpen (boolean), aiOpen (boolean)
- Hardcoded: nav item labels, icons (lucide-react), logo "M" mark, section headers, all CSS classes

## SidebarNavItem

- Source: derived from app-shell nav Link rendering
- Category: basic
- Description: Single navigation link with icon and label
- Extractable props: href (string), label (string), icon (LucideIcon), isActive (boolean)
- Hardcoded: hover/focus styles, gap/spacing classes

## StatCard

- Source: derived from dashboard/page.tsx stat card grid
- Category: basic
- Description: Metric card showing entity count with label
- Extractable props: label (string), value (string | number), href (string)
- Hardcoded: card border hover effect, typography scale

## BriefingCard

- Source: derived from dashboard/page.tsx briefing section
- Category: basic
- Description: AI daily briefing with summary and key metrics
- Extractable props: summary (string), openDealCount (number), openDealValue (number), overdueCount (number), activeProjects (number)
- Hardcoded: Sparkles icon, primary border accent, layout

## EntityTable

- Source: derived from entities/[entity]/page.tsx table
- Category: basic
- Description: Data table with sortable columns and row actions
- Extractable props: columns (array), rows (array), onDelete (function)
- Hardcoded: table styling, hover states, action button layout

## CommandPalette

- Source: `apps/web/src/components/command-palette.tsx`
- Category: layout
- Description: Modal command palette for navigation and entity search
- Extractable props: open (boolean), onOpenChange (function), entities (array)
- Hardcoded: overlay, input placeholder, group headings

## AiChatPanel

- Source: `apps/web/src/components/ai-chat.tsx`
- Category: layout
- Description: Slide-over AI assistant chat panel
- Extractable props: open (boolean), onOpenChange (function), messages (array)
- Hardcoded: panel width (w-96), message bubble styles, header layout

## LoginCard

- Source: derived from app/page.tsx
- Category: basic
- Description: Centered login form card with logo and credentials
- Extractable props: error (string), loading (boolean)
- Hardcoded: logo mark, form layout, demo credentials placeholder

## Button

- Source: `apps/web/src/components/ui/button.tsx`
- Category: basic
- Description: Primary UI button with variants and sizes
- Extractable props: variant, size, disabled, children
- Hardcoded: CVA class strings, focus ring

## Card

- Source: `apps/web/src/components/ui/card.tsx`
- Category: basic
- Description: Container card with header, title, content
- Extractable props: children, className
- Hardcoded: border, shadow, padding
