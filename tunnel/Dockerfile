FROM node:20-alpine

WORKDIR /app

COPY tunnel/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY tunnel/server.js ./

EXPOSE 4010 11434

CMD ["node", "server.js"]