# syntax=docker/dockerfile:1
# Multi-stage Dockerfile for @used-books/api (API server, order-worker, media-worker, mongo-migrate)
# Build from monorepo root: docker build -f apps/api/Dockerfile -t latlai-api .

FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
WORKDIR /app

FROM base AS builder
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY packages/api-contract/package.json ./packages/api-contract/package.json
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @used-books/api...
COPY packages/api-contract ./packages/api-contract
COPY apps/api ./apps/api
RUN pnpm --filter @used-books/api build

FROM base AS runtime
ENV NODE_ENV=development
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/api-contract ./packages/api-contract
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist

WORKDIR /app/apps/api
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/v1/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Override CMD to run workers or migrations from the same image:
#   node dist/mongo-migrate.js
#   node dist/order-worker.js
#   node dist/media-worker.js
CMD ["node", "dist/main.js"]
