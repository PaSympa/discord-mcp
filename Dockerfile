# Stage 1: Build
FROM node:26-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src/ src/
RUN npm run build

# Stage 2: Run
FROM node:26-alpine

LABEL io.modelcontextprotocol.server.name="io.github.PaSympa/discord-mcp"
LABEL org.opencontainers.image.title="Discord MCP Server"
LABEL org.opencontainers.image.description="Run your Discord server from Claude, Cursor or VS Code: messages, moderation, roles, forums, events"
LABEL org.opencontainers.image.source="https://github.com/PaSympa/discord-mcp"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

COPY --from=builder /app/dist/ dist/

USER nodejs
ENV NODE_ENV=production
ENTRYPOINT ["node", "dist/index.js"]
