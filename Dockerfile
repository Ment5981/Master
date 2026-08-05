FROM node:24-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
ENV MASTER_SELF_HOSTED=1
RUN npm run build:self-hosted
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:24-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    MASTER_SELF_HOSTED=1 \
    MASTER_SQLITE_PATH=/data/master.sqlite \
    PORT=3000

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 3000

CMD ["npm", "run", "start:self-hosted"]
