FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/gateway/package.json apps/gateway/package.json
RUN npm ci

COPY apps/gateway apps/gateway
RUN npm run build --workspace @enamel-ai/gateway

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/gateway/package.json apps/gateway/package.json
RUN npm ci --omit=dev --workspace @enamel-ai/gateway && npm cache clean --force

COPY --from=build /app/apps/gateway/dist apps/gateway/dist
COPY infra/postgres/migrations infra/postgres/migrations

USER node
EXPOSE 3000

CMD ["node", "apps/gateway/dist/server.js"]
