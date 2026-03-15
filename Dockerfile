FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG DATABASE_PATH=/tmp/kasoku.db
ARG AUTH_PASSWORD_HASH
ARG JWT_SECRET
ENV DATABASE_PATH=$DATABASE_PATH \
    AUTH_PASSWORD_HASH=$AUTH_PASSWORD_HASH \
    JWT_SECRET=$JWT_SECRET
RUN bun run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["bun", "server.js"]
