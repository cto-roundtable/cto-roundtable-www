FROM node:22-slim AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

FROM node:22-slim

WORKDIR /app

COPY --from=build /app/.output /app/.output

ENV HOST=0.0.0.0
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", ".output/server/index.mjs"]
