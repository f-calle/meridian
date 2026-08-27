# Meridian Page Dependency Trees

## / (Login)

Entry: `apps/web/src/app/page.tsx`

Dependencies:
- `apps/web/src/components/ui/button.tsx`
  - `apps/web/src/lib/utils.ts`
- `apps/web/src/components/ui/input.tsx`
  - `apps/web/src/lib/utils.ts`
- `apps/web/src/components/ui/label.tsx`
  - `apps/web/src/lib/utils.ts`
- `apps/web/src/components/ui/card.tsx`
  - `apps/web/src/lib/utils.ts`
- `apps/web/src/lib/api.ts`

## /dashboard

Entry: `apps/web/src/app/dashboard/page.tsx`

Dependencies:
- `apps/web/src/app/dashboard/layout.tsx`
  - `apps/web/src/components/app-shell.tsx`
    - `apps/web/src/components/ui/button.tsx`
    - `apps/web/src/components/command-palette.tsx`
      - `apps/web/src/lib/api.ts`
    - `apps/web/src/components/ai-chat.tsx`
      - `apps/web/src/components/ui/button.tsx`
      - `apps/web/src/components/ui/input.tsx`
      - `apps/web/src/lib/api.ts`
    - `apps/web/src/lib/api.ts`
- `apps/web/src/components/ui/card.tsx`
- `apps/web/src/lib/api.ts`
- `lucide-react` (Sparkles icon)

## /entities/[entity]

Entry: `apps/web/src/app/entities/[entity]/page.tsx`

Dependencies:
- `apps/web/src/app/entities/layout.tsx`
  - `apps/web/src/components/app-shell.tsx` (full tree as above)
- `apps/web/src/components/ui/button.tsx`
- `apps/web/src/components/ui/input.tsx`
- `apps/web/src/components/ui/label.tsx`
- `apps/web/src/components/ui/card.tsx`
- `apps/web/src/lib/api.ts`
- `lucide-react` (Plus, Search, Trash2 icons)

## /migration

Entry: `apps/web/src/app/migration/page.tsx`

Dependencies:
- `apps/web/src/app/migration/layout.tsx`
  - `apps/web/src/components/app-shell.tsx` (full tree as above)
- `apps/web/src/components/ui/button.tsx`
- `apps/web/src/components/ui/input.tsx`
- `apps/web/src/components/ui/label.tsx`
- `apps/web/src/components/ui/card.tsx`
- `apps/web/src/lib/api.ts`
- `lucide-react` (Import, CheckCircle, AlertCircle icons)
