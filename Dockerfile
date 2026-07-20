# syntax=docker/dockerfile:1

# bookworm (glibc) rather than alpine: sharp and @napi-rs/canvas ship glibc
# prebuilds, and PDF rendering needs sane font support.
FROM node:24-bookworm-slim AS base
RUN corepack enable pnpm
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# One-off migration runner: docker compose -f docker-compose.prod.yml run --rm migrate
FROM deps AS migrate
COPY prisma ./prisma
COPY prisma.config.ts ./
CMD ["pnpm", "prisma", "migrate", "deploy"]

FROM deps AS build
COPY . .
# prisma.config.ts loads DATABASE_URL at config time; generate itself is
# offline in Prisma 7, so a placeholder is fine here.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN pnpm prisma generate
RUN pnpm build

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:24-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
# Fonts for pdfjs when a PDF doesn't embed its own. tzdata so the TZ env var
# (set in docker-compose) resolves — bookworm-slim ships without zoneinfo, and
# without it TZ silently falls back to UTC and shifts recurring schedules a day.
RUN apt-get update \
  && apt-get install -y --no-install-recommends fonts-liberation tzdata \
  && rm -rf /var/lib/apt/lists/*
# The server bundle externalizes node_modules, so prod deps must ship.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json server.prod.mjs ./
EXPOSE 3000
USER node
CMD ["node", "server.prod.mjs"]
