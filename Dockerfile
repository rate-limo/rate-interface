# Build context = repo root. RAILWAY_DOCKERFILE_PATH=apps/web/Dockerfile
# NEXT_PUBLIC_* vars must be present at BUILD time (Railway passes service
# variables to Dockerfile builds).
FROM node:22-slim
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo build --filter=web

ENV NODE_ENV=production
WORKDIR /repo/apps/web
CMD ["sh", "-c", "pnpm exec next start -p ${PORT:-3000}"]
