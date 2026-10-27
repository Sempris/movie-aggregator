# syntax=docker/dockerfile:1.7
# Build from the repository root:  docker build -f apps/api/Dockerfile -t ratemix-api .
# One image runs both roles:  node dist/main.js (API)  |  node dist/worker.js (ingestion workers)

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS build
WORKDIR /repo
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter @ratemix/shared build && pnpm --filter @ratemix/api build
# Self-contained production bundle: dist, prisma schema + migrations, prod node_modules.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm --filter @ratemix/api deploy --prod /out

FROM base AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
