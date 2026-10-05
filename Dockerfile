# ---------- Stage 1: зависимости ----------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

# ---------- Stage 2: рантайм (nginx + node) ----------
FROM node:20-alpine
WORKDIR /app

# nginx + supervisor
RUN apk add --no-cache nginx supervisor

ENV NODE_ENV=production \
    PORT=3000 \
    NODE_OPTIONS="--max-old-space-size=192"

# непривилегированный пользователь для Node
RUN addgroup -S app && adduser -S app -G app

# node_modules, код, статика
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY server ./server
COPY public ./public

# конфиги nginx + supervisor
COPY nginx/default.conf    /etc/nginx/http.d/default.conf
COPY nginx/supervisord.conf /etc/supervisord.conf

# служебные папки и права
RUN mkdir -p /app/data /var/log/nginx /var/lib/nginx/tmp /run/nginx \
 && chown -R app:app /app /var/log/nginx /var/lib/nginx /run/nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1

CMD ["supervisord", "-c", "/etc/supervisord.conf"]