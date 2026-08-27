# Superdesign Canvas Setup

Superdesign canvas drafts require CLI authentication. Run these steps locally after merging this branch.

## 1. Authenticate

```bash
npx --yes @superdesign/cli@latest login
```

Complete browser authorization when prompted.

## 2. Create Project

```bash
npx --yes @superdesign/cli@latest create-project --title "Meridian UI/UX"
```

Save the `projectId` from the output.

## 3. Reproduce Key Surfaces

Context files are pre-built in `.superdesign/init/`. Generate drafts in this order:

```bash
# App shell + dashboard
npx --yes @superdesign/cli@latest create-design-draft \
  --project-id <PROJECT_ID> \
  --title "Dashboard + Shell" \
  --prompt "Reproduce Meridian dashboard with sidebar, AI briefing card, stat grid. Dark ERP theme per design-system.md." \
  --context-file .superdesign/init/layouts.md \
  --context-file .superdesign/init/theme.md \
  --context-file apps/web/src/app/dashboard/page.tsx \
  --context-file apps/web/src/components/app-shell.tsx

# Entity list with bulk actions
npx --yes @superdesign/cli@latest create-design-draft \
  --project-id <PROJECT_ID> \
  --title "Entity List" \
  --prompt "Reproduce entity list with search, pagination, row selection, bulk delete bar, table." \
  --context-file apps/web/src/app/entities/[entity]/page.tsx \
  --context-file .superdesign/init/components.md

# Entity detail with audit timeline
npx --yes @superdesign/cli@latest create-design-draft \
  --project-id <PROJECT_ID> \
  --title "Entity Detail" \
  --prompt "Entity detail page with view/edit form and activity timeline sidebar." \
  --context-file apps/web/src/app/entities/[entity]/[id]/page.tsx \
  --context-file apps/web/src/components/entity-audit-timeline.tsx
```

## 4. Iterate Polish

```bash
npx --yes @superdesign/cli@latest iterate-design-draft \
  --draft-id <DRAFT_ID> \
  --mode replace \
  -p "Refine dark/light theme support, layered shadows, active nav, professional ERP density."
```

Open canvas with `?live=1` on the project URL from CLI output.

## Resume State

After first successful draft, update `.superdesign/resume.json` with project/draft IDs per target route (see RESUME.md in Superdesign skill).
