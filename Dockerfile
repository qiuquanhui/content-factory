FROM node:24-bookworm-slim AS builder
WORKDIR /usr/src
COPY . .
RUN npm install --global pnpm@10.30.3 && pnpm install --frozen-lockfile
RUN pnpm run build

FROM node:24-bookworm-slim
WORKDIR /usr/app
ENV HOST=0.0.0.0 PORT=3000 NODE_ENV=production
COPY --from=builder /usr/src/dist/output ./output
RUN mkdir -p /usr/app/.data
VOLUME ["/usr/app/.data"]
EXPOSE 3000
CMD ["node", "--use-env-proxy", "output/server/index.mjs"]
