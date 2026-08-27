# Meridian Routes

Next.js 15 App Router — frontend in `apps/web/src/app/`.

| URL | File | Layout | Description |
|-----|------|--------|-------------|
| `/` | `apps/web/src/app/page.tsx` | Root layout | Login page with email/password form |
| `/dashboard` | `apps/web/src/app/dashboard/page.tsx` | AppShell via `dashboard/layout.tsx` | Dashboard with AI briefing and entity stat cards |
| `/entities/[entity]` | `apps/web/src/app/entities/[entity]/page.tsx` | AppShell via `entities/layout.tsx` | Dynamic entity list/CRUD (contact, company, deal, etc.) |
| `/migration` | `apps/web/src/app/migration/page.tsx` | AppShell via `migration/layout.tsx` | Odoo import wizard |

## Entity Routes (dynamic)

All entity pages share the same component at `/entities/[entity]`:

- `/entities/contact` — Contacts
- `/entities/company` — Companies
- `/entities/deal` — Deals
- `/entities/activity` — Activities
- `/entities/project` — Projects
- `/entities/task` — Tasks
- `/entities/time_entry` — Time Entries
- `/entities/milestone` — Milestones
- `/entities/automation` — Automations

## Auth Flow

- Unauthenticated users see `/` (login)
- After login, redirect to `/dashboard`
- AppShell checks token and redirects to `/` if missing
