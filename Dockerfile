# ==========================================
# Multi-stage Bun Dockerfile for fs-digiflazz-service
# ==========================================
FROM oven/bun:1.4-alpine AS base
WORKDIR /app

# Step 1: Install production dependencies
FROM base AS dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Step 2: Runtime image
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3002

WORKDIR /app

# Copy dependencies and application source
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY dummy.json ./dummy.json

# Run as non-root bun user for security
USER bun
EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3002/health || exit 1

CMD ["bun", "src/index.ts"]
