# ── build ────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG APP_VERSION=dev
ENV DATA_DIR=/tmp/build-data
RUN npm run build && npm prune --omit=dev

# ── runtime ──────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim
LABEL org.opencontainers.image.source="https://github.com/swider8814/proem-quiz"
WORKDIR /app
# ffmpeg: wycinanie fragmentów audio
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl \
	&& rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
	BODY_SIZE_LIMIT=36M \
	PORT=3000 \
	DATA_DIR=/data
ARG APP_VERSION=dev
ARG APP_BUILD=
ARG APP_BUILT_AT=
ENV APP_VERSION=$APP_VERSION APP_BUILD=$APP_BUILD APP_BUILT_AT=$APP_BUILT_AT
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./
COPY server ./server
COPY drizzle ./drizzle
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD curl -fsS http://127.0.0.1:${PORT}/health || exit 1
CMD ["node", "server/index.js"]
