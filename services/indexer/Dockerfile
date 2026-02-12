# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN npm install -g pnpm@9

WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY services/indexer/package.json ./services/indexer/
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Stage 2: Builder
FROM node:20-alpine AS builder
RUN npm install -g pnpm@9

WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/services/indexer/node_modules ./services/indexer/node_modules
COPY --from=deps /app/packages ./packages

# Copy source code
COPY . .

# Build the application
RUN pnpm turbo run build --filter=@skillhub/indexer

# Stage 3: Runner (minimal - all deps are bundled)
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 indexer

# Copy only the bundled dist (no node_modules needed - everything is bundled)
COPY --from=builder --chown=indexer:nodejs /app/services/indexer/dist ./dist

USER indexer

CMD ["node", "dist/worker.js"]
