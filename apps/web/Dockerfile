# syntax=docker/dockerfile:1.7
# Build from the repository root:  docker build -f apps/web/Dockerfile -t ratemix-web .

FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
ARG VITE_API_URL=
ARG VITE_SENTRY_DSN=
RUN pnpm --filter @ratemix/shared build && pnpm --filter @ratemix/web exec vite build

FROM nginx:1.29-alpine
# Where nginx forwards /trpc and /auth/oauth. Override when the API isn't the "api" compose service.
ENV API_UPSTREAM=http://api:3000
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
