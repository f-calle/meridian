# Meridian Design System

## Brand Identity

**Product:** Meridian — AI-native ERP for CRM, projects, and business management
**Personality:** Professional, data-dense, trustworthy, AI-forward
**Theme:** Dark-only (for now)

## Color Palette

- **Background:** Deep navy `#0a0f1a` (hsl 222 47% 6%)
- **Surface/Cards:** Slightly elevated `#0d1424` (hsl 222 47% 8%)
- **Primary:** Bright blue `#3b82f6` (hsl 217 91% 60%) — CTAs, active states, AI accents
- **Muted text:** `#94a3b8` (hsl 215 20% 65%)
- **Destructive:** Red `#dc2626` (hsl 0 62% 50%)
- **Borders:** Semi-transparent slate, tinted toward background hue

## Typography

- **UI font:** Inter (system fallback stack)
- **Monospace (metrics):** Geist Mono or ui-monospace for tabular numbers
- **Headings:** font-bold, tracking-tight
- **Body:** text-sm (14px) for dense ERP views
- **Section labels:** text-xs uppercase tracking-wider, muted-foreground

## Spacing & Layout

- **Sidebar:** 256px fixed width (desktop); collapsible sheet on mobile
- **Page padding:** 32px (p-8)
- **Card padding:** 24px (p-6)
- **Grid gaps:** 16px (gap-4)
- **Nav item height:** ~36px with 12px horizontal padding

## Elevation & Borders

- **Cards:** Layered shadow (ambient + direct), 1px border at 50% opacity
- **Modals/Panels:** shadow-2xl, overscroll-behavior contain
- **Nested radii:** Child radius ≤ parent radius
- **Hover states:** Increased contrast on borders and backgrounds

## Components

### Navigation
- Left sidebar with section groups (CRM, Projects, Tools)
- Active item: primary-tinted background + left border accent
- Bottom actions: Command palette (⌘K), AI Assistant, Sign out

### Dashboard
- Hero: AI Briefing card with primary border accent
- Stat grid: 5-column on lg, responsive stack on mobile
- Numbers: tabular-nums, formatted currency

### Entity Lists
- Header: title + count + search + New button
- Table: zebra hover, action dropdown (not bare icon)
- Empty state: centered illustration area + CTA
- Loading: skeleton rows matching table structure

### Overlays
- Command palette: centered modal, keyboard-first
- AI chat: right slide-over panel, 384px width

### Forms
- Labels above inputs, inline errors
- Destructive confirm via Dialog, not browser confirm()
- Loading buttons keep label + spinner

## Motion

- **Level:** Low (ERP professional)
- Transitions: 150ms ease on colors, opacity
- Honor prefers-reduced-motion
- No autoplay animations

## Accessibility

- Focus-visible rings on all interactives
- Icon buttons have aria-label
- Skip to content link
- aria-live for AI responses
- color-scheme: dark on html

## Logo

Current placeholder: "M" in rounded square with primary background.
Target: Meridian logomark — geometric compass/meridian line motif in primary blue on dark.

## Icons

Lucide React icon set throughout. Icons paired with text labels in navigation; icon-only buttons require aria-label.
