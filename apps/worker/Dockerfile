FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/entities/package.json ./packages/entities/
COPY packages/ui-schema/package.json ./packages/ui-schema/
COPY packages/ai/package.json ./packages/ai/
COPY packages/migration/package.json ./packages/migration/
COPY packages/cli/package.json ./packages/cli/
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY apps/mcp/package.json ./apps/mcp/
COPY apps/web/package.json ./apps/web/
COPY plugins/example-plugin/package.json ./plugins/example-plugin/
RUN pnpm install --frozen-lockfile --filter @meridian/worker...

FROM base AS builder
COPY --from=deps /app ./
COPY tsconfig.base.json turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker
COPY apps/mcp ./apps/mcp
COPY plugins ./plugins
RUN pnpm --filter @meridian/worker... build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app ./
CMD ["node", "apps/worker/dist/index.js"]
