FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/core/package.json ./packages/core/
COPY packages/entities/package.json ./packages/entities/
COPY packages/ui-schema/package.json ./packages/ui-schema/
COPY packages/ai/package.json ./packages/ai/
COPY packages/migration/package.json ./packages/migration/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile || pnpm install

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter @meridian/core build && \
    pnpm --filter @meridian/entities build && \
    pnpm --filter @meridian/ui-schema build && \
    pnpm --filter @meridian/ai build && \
    pnpm --filter @meridian/migration build && \
    pnpm --filter @meridian/api build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app ./
EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
