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
RUN pnpm install --frozen-lockfile --filter @meridian/web...

FROM base AS builder
COPY --from=deps /app ./
COPY apps/web ./apps/web
WORKDIR /app/apps/web
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* values are inlined at build time
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
# outputFileTracingRoot is the workspace root, so standalone mirrors the monorepo
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
