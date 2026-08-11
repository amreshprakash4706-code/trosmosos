# Trosmos OS 4.2.1 — production container
# Requires Node.js 22+ (uses built-in node:sqlite)
FROM node:22-bookworm-slim

WORKDIR /app

# Install production dependencies only (no native addons required)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY server ./server
COPY public ./public
COPY index.html ./
COPY dist ./dist
COPY netlify.toml ./

# Data directory for SQLite (mount a volume in production)
RUN mkdir -p /app/server/data && chown -R node:node /app
USER node

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/system/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/src/index.js"]
