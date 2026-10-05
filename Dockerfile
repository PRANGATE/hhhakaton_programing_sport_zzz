# ---------- Stage 1: зависимости ----------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
# npm install вместо ci — работает и без package-lock.json
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

# ---------- Stage 2: рантайм ----------
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    NODE_OPTIONS="--max-old-space-size=192"

# непривилегированный пользователь
RUN addgroup -S app && adduser -S app -G app

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY server ./server
COPY public ./public

RUN mkdir -p /app/data && chown -R app:app /app
USER app

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "server/index.js"]