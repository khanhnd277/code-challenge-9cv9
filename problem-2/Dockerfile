# ─── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ─── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Install production dependencies only
# drizzle-kit is needed at runtime to run schema push/migrate on startup
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled app from builder
COPY --from=builder /app/dist ./dist

# Copy drizzle config — drizzle-kit reads TypeScript schema files directly
# so the source schema files must be present alongside drizzle.config.ts
COPY drizzle.config.ts ./
COPY src/db/schema.pg.ts ./src/db/schema.pg.ts
COPY src/db/schema.ts ./src/db/schema.ts

# Copy any pre-generated migration files
COPY drizzle ./drizzle

EXPOSE 3000

# On startup: push schema to DB (no-op if tables already exist), then start app
CMD ["sh", "-c", "npx drizzle-kit push && node dist/app.js"]
