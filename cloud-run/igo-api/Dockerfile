# Build context: repo root
# docker build -f cloud-run/igo-api/Dockerfile -t igo-api .

# ── Build stage ────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

COPY cloud-run/igo-api/package.json cloud-run/igo-api/tsconfig.json ./
RUN npm install

# Shared game logic (relative imports, no path aliases)
COPY hooks/go/engine.ts        ./src/engine.ts
COPY hooks/go/board-features.ts ./src/board-features.ts
COPY hooks/go/puct-mcts.ts     ./src/puct-mcts.ts

# API server
COPY cloud-run/igo-api/src/server.ts ./src/server.ts

RUN npm run build

# ── Runtime stage ──────────────────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist        ./dist

# ONNX model files
COPY public/models ./models

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "dist/server.js"]
