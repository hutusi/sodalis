# Two runtime targets from one build context:
#   app    — Next.js standalone server on Node
#   worker — scheduler + outbox, Bun executing TypeScript directly
# Build from the repo root:  docker build -f docker/Dockerfile --target app .

FROM node:22-slim AS base
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
# Full install (incl. dev deps): the worker image also serves as the
# one-shot migration runner, which needs drizzle-kit.
RUN bun install --frozen-lockfile

FROM base AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

FROM node:22-slim AS app
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]

FROM oven/bun:1-slim AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/node_modules ./node_modules
COPY package.json tsconfig.json drizzle.config.ts ./
COPY src ./src
COPY drizzle ./drizzle
COPY data ./data
COPY scripts ./scripts
CMD ["bun", "run", "src/worker/index.ts"]
