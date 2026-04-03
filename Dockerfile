# ---- Base ----
FROM node:20-alpine AS base

# ---- Dependencies ----
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN \
  if [ -f package-lock.json ]; then npm ci; \
  else npm install; \
  fi

# ---- Builder ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Accept OPENCLAW_API_URL at build time so it can be baked into the client bundle.
# It can also be overridden at runtime via the environment variable.
ARG OPENCLAW_API_URL=http://localhost:8000
ENV OPENCLAW_API_URL=${OPENCLAW_API_URL}

# Gateway WebSocket URL and token baked into the client bundle (NEXT_PUBLIC_* vars)
ARG NEXT_PUBLIC_OPENCLAW_GATEWAY_WS_URL=ws://localhost:18789
ENV NEXT_PUBLIC_OPENCLAW_GATEWAY_WS_URL=${NEXT_PUBLIC_OPENCLAW_GATEWAY_WS_URL}
ARG NEXT_PUBLIC_OPENCLAW_GATEWAY_TOKEN=
ENV NEXT_PUBLIC_OPENCLAW_GATEWAY_TOKEN=${NEXT_PUBLIC_OPENCLAW_GATEWAY_TOKEN}

# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---- Runner ----
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Set correct permissions for Next.js prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Copy standalone output (includes server.js and required node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# OPENCLAW_API_URL can be overridden at runtime
ENV OPENCLAW_API_URL=http://localhost:8000

CMD ["node", "server.js"]
