# syntax=docker/dockerfile:1
# Pin by digest in production: `docker buildx imagetools inspect node:22.12.0-bookworm-slim` and use node@sha256:…
ARG NODE_IMAGE=node:22.12.0-bookworm-slim

# ───────── deps ─────────
FROM ${NODE_IMAGE} AS deps
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
# --ignore-scripts: dependency install scripts never run during the build (prebuilt binaries are used instead).
RUN npm ci --ignore-scripts

# ───────── build ─────────
FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_STANDALONE=1
COPY . .
RUN npx prisma generate && npm run build

# ───────── tools: migrations + background worker (source tree + tsx) ─────────
FROM build AS tools
ENV NODE_ENV=production HOME=/tmp
RUN chown -R node:node /app
USER node
CMD ["npx", "tsx", "scripts/worker.ts"]

# ───────── web: minimal Next.js standalone server, non-root, read-only code ─────────
FROM ${NODE_IMAGE} AS web
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 UPLOAD_DIR=/data/uploads
# Application files stay root-owned and read-only for the runtime user; only the uploads volume is writable.
COPY --from=build --chown=root:root /app/.next/standalone ./
COPY --from=build --chown=root:root /app/.next/static ./.next/static
COPY --from=build --chown=root:root /app/public ./public
RUN mkdir -p /data/uploads /app/.next/cache && chown -R node:node /data /app/.next/cache
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
