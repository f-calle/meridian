---
name: meridian-web-guidelines
description: Audit and implement Meridian UI against Vercel Web Interface Guidelines plus ERP-specific UX rules. Use when designing, reviewing, or implementing Meridian frontend code in apps/web.
---

# Meridian Web Guidelines

Audit and implement Meridian frontend code against Vercel Web Interface Guidelines, extended with ERP-specific UX rules for this codebase.

## When to Use

- Designing or implementing UI in `apps/web/**`
- Reviewing PRs that touch frontend components
- After Superdesign approval, before opening a PR
- When fixing accessibility, forms, loading states, or navigation UX

## How It Works

1. Fetch the latest Vercel rules from the source URL below
2. Read the specified files (or all changed files in `apps/web/src/**`)
3. Check against Vercel rules **and** Meridian-specific rules below
4. Output findings in terse `file:line` format
5. Fix all findings before marking work complete

## Guidelines Source

Fetch fresh Vercel rules before each review:

```
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

Apply every rule from the fetched content. This skill adds Meridian-specific requirements on top.

## Meridian-Specific Rules

These extend Vercel guidelines for Meridian's AI-native ERP context (`apps/web`).

### App Shell & Navigation

- Sidebar must show **active route** state (visual indicator for current page)
- Mobile: sidebar collapses into a Sheet/drawer; no horizontal overflow on small screens
- `<main>` must have an id target for skip-to-content link
- Nav links use Next.js `<Link>`, never `<button>` for route navigation
- Section labels (CRM, Projects, Tools) must not look interactive

### Dashboard

- Stat cards use `tabular-nums` for counts and currency
- Currency formatted via `Intl.NumberFormat`, not string concatenation
- Briefing card: loading skeleton, error state, and empty state all designed
- Skeleton layout mirrors final card/table structure (no layout shift)

### Entity CRUD (`/entities/[entity]`)

- **Never** use `alert()` or `confirm()` — use Dialog for destructive confirm, toast for errors
- Search/filter state persisted in URL query params (deep-linkable)
- Debounce search input (≥ 300ms) to avoid excessive API calls
- Table: empty, loading (skeleton rows), sparse, and dense states all handled
- Icon-only delete/action buttons need `aria-label`
- Delete requires confirmation Dialog with clear entity name
- Form errors inline next to fields; focus first error on submit

### Command Palette

- Full keyboard navigation per WAI-ARIA combobox/listbox patterns
- Escape closes palette; focus trap while open
- `overscroll-behavior: contain` on scrollable list
- Return focus to trigger on close

### AI Assistant Panel

- Icon buttons (close, send) need descriptive `aria-label`
- Async responses announced via `aria-live="polite"` region
- Loading state uses ellipsis character: `Thinking…` not `Thinking...`
- Escape closes panel; focus trap while open
- Textarea: ⌘/Ctrl+Enter sends; Enter inserts newline (if multiline)

### Login Page

- Submit button shows spinner + original label during loading (`Signing in…`)
- Error messages guide recovery (not just "Invalid credentials")
- Inputs have `autocomplete`, meaningful `name`, correct `type`
- Placeholders end with `…` when indicating emptiness

### Migration Wizard

- Step progress visible (connect → preview → import → report)
- Connection errors inline with recovery action
- Import report human-readable, not raw JSON dump

### Theme & Tokens

- `<html>` has `color-scheme: dark` (Meridian is dark-only today)
- `<meta name="theme-color">` matches page background
- Layered shadows on elevated surfaces (cards, modals, panels)
- Semi-transparent borders for edge clarity on dark backgrounds
- `prefers-reduced-motion`: disable or reduce animations

### Copy (Meridian + Vercel)

- Active voice, second person
- Title Case for headings and buttons
- Numerals for counts: `8 deals` not `eight deals`
- Specific button labels: `Save Contact` not `Continue`
- Use `…` (ellipsis character) not `...` for loading/truncation
- No em-dashes in UI copy

## Implementation Checklist

Run before opening a PR for Meridian UI work:

- [ ] Fetched latest Vercel rules and applied all applicable checks
- [ ] All Meridian-specific rules above satisfied for touched surfaces
- [ ] No `alert()`, `confirm()`, or `window.confirm()` in changed files
- [ ] Icon-only buttons have `aria-label`
- [ ] Loading states use skeletons matching final layout
- [ ] Focus visible on all interactive elements (`focus-visible:ring-*`)
- [ ] Mobile layout tested (sidebar, stat grid, entity table)
- [ ] Keyboard: Tab nav, ⌘K palette, Escape dismissals work

## Output Format

Group by file. Use `file:line` format (VS Code clickable). Terse findings.

```text
## apps/web/src/components/app-shell.tsx

apps/web/src/components/app-shell.tsx:80 - nav link missing active state indicator
apps/web/src/components/app-shell.tsx:99 - icon button missing aria-label

## apps/web/src/app/dashboard/page.tsx

✓ pass
```

State issue + location. Skip explanation unless fix is non-obvious. No preamble.

## Related Skills

- `@design-taste-frontend` — visual polish, density/motion dials, anti-slop pre-flight
- `@web-design-guidelines` — upstream Vercel audit skill (generic, no Meridian extensions)

Attach both `@design-taste-frontend` and `@meridian-web-guidelines` when implementing Meridian UI changes.
