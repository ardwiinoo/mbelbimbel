# syntax=docker/dockerfile:1
# Template Next.js (output: 'standalone'). Build dilakukan di GitHub Actions, bukan di VPS.

FROM node:22-alpine AS base

# --- 1. Install dependency ---
FROM base AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
# pnpm-workspace.yaml berisi izin build script (allowBuilds); tanpa file ini pnpm install gagal.
COPY package.json package-lock.json* pnpm-lock.yaml* pnpm-workspace.yaml* yarn.lock* ./
RUN \
  if [ -f pnpm-lock.yaml ]; then corepack enable && pnpm install --frozen-lockfile; \
  elif [ -f yarn.lock ]; then corepack enable && yarn install --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  else echo "Lockfile tidak ditemukan" && exit 1; fi

# --- 2. Build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Variabel NEXT_PUBLIC_* ditanam saat build. Tambahkan yang kamu butuhkan di sini
# DAN di bagian build-args pada .github/workflows/deploy.yml.
ARG NEXT_PUBLIC_SITE_URL=""
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN \
  if [ -f pnpm-lock.yaml ]; then corepack enable && pnpm run build; \
  elif [ -f yarn.lock ]; then corepack enable && yarn build; \
  else npm run build; fi

# --- 3. Image akhir (kecil, tanpa dev dependency) ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Pastikan folder "public" ada di repo (boleh kosong, tambahkan file .gitkeep).
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Folder file upload (UPLOAD_DIR). Di VPS di-mount dari host lewat docker-compose:
#   /srv/files/${APP_NAME}:/app/uploads  → folder host harus milik uid 1001.
RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
