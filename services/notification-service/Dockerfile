# -----------------------------------------------------------------------------
# Stage 1: Build & Compile TypeScript
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package descriptors first to leverage Docker layer caching
COPY package*.json tsconfig.json ./

# Install all dependencies including devDependencies for compilation
RUN npm ci

# Copy source code and build
COPY src/ ./src/
RUN npm run build

# Prune devDependencies to keep image lean
RUN npm prune --production

# -----------------------------------------------------------------------------
# Stage 2: Production Minimal Runtime
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8084

# Install basic fonts for PDF rendering
RUN apk add --no-cache ttf-dejavu

# Security: run as non-root user
USER node

# Copy only production dependencies and built assets from builder stage
COPY --chown=node:node --from=builder /app/package*.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist

EXPOSE 8084

# Healthcheck probe for container runtime
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8084/health || exit 1

CMD ["node", "dist/index.js"]
