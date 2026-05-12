# syntax=docker/dockerfile:1.7

# ---- deps stage ----
# Install all deps + generate Prisma client
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
# Using `npm install` instead of `npm ci`: the lock file generated on
# Windows host may differ from Linux-resolved optional deps. `install`
# tolerates that.
RUN npm install --no-audit --no-fund
RUN npx prisma generate

# ---- build stage ----
# Compile TS -> dist (SWC + tsc type check)
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/generated ./src/generated
COPY . .
RUN npm run build && \
    # Workaround: SWC on Linux preserves .ts extension in require()
    # for sibling .ts files in src/generated/prisma. Strip it post-build.
    find dist/generated -name "*.js" -exec sed -i 's/\.ts")/")/g' {} +

# ---- runner stage ----
# Minimal production image. libssl is already present via node:20-alpine,
# wget comes from BusyBox.
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 nodejs && \
    adduser -S -u 1001 -G nodejs nestjs

COPY --from=build --chown=nestjs:nodejs /app/dist ./dist
COPY --from=build --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nestjs:nodejs /app/prisma.config.ts ./
COPY --from=build --chown=nestjs:nodejs /app/package.json ./

USER nestjs
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/v1/health || exit 1

CMD ["node", "dist/main.js"]
