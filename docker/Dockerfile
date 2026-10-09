# syntax=docker/dockerfile:1.7

# ---- deps stage ----
# Install all deps + generate Prisma client
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
# `npm ci` требует lockfile, синхронный с package.json; `--include=optional`
# нужен для платформо-специфичных бинарников (@swc/core-linux-x64-gnu и т.п.)
RUN npm ci --include=optional
RUN npx prisma generate

# ---- build stage ----
# Compile TS -> dist (SWC + tsc type check)
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/generated ./src/generated
COPY . .
RUN npm run build && \
    # Workaround: SWC on Linux preserves .ts extension in require()
    # for sibling .ts files in src/generated/prisma. Strip it post-build.
    find dist/generated -name "*.js" -exec sed -i 's/\.ts")/")/g' {} +

# ---- runner stage ----
# Minimal production image. libssl3 (нужен Prisma) уже есть в node:24-bookworm-slim;
# healthcheck использует встроенный в Node fetch — curl/wget не требуются.
FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -M -s /usr/sbin/nologin nestjs

COPY --from=build --chown=nestjs:nodejs /app/dist ./dist
COPY --from=build --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nestjs:nodejs /app/prisma.config.ts ./
COPY --from=build --chown=nestjs:nodejs /app/package.json ./

USER nestjs
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/v1/health').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/main.js"]
