# Two runtime targets from one build context:
#   app    — Next.js standalone server on Node
#   worker — scheduler + outbox, Bun executing TypeScript directly
# Build from the repo root:  docker build -f docker/Dockerfile --target app .

# Bun version pinned to match .bun-version (CI reads that file directly;
# update both together).
FROM node:22-slim AS base
COPY --from=oven/bun:1.3.14 /usr/local/bin/bun /usr/local/bin/bun
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
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]

FROM oven/bun:1.3.14-slim AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base --chown=bun:bun /app/node_modules ./node_modules
COPY --chown=bun:bun package.json tsconfig.json drizzle.config.ts ./
COPY --chown=bun:bun src ./src
COPY --chown=bun:bun drizzle ./drizzle
COPY --chown=bun:bun data ./data
COPY --chown=bun:bun scripts ./scripts
USER bun
CMD ["bun", "run", "src/worker/index.ts"]
