# CarbonIQ FinTech — the API container.
#
# Local development only; production is a Netlify Function.
#
#   docker compose -f docker/docker-compose.yml up
#
# Two stages, because one image cannot be both. `npm ci --production` omits
# devDependencies, so the previous single-stage image could run the server and
# not one check — no jest, no eslint, no tsc. A container a developer cannot
# test in is a container they stop using.
#
# The Node version comes from .nvmrc and is stated in exactly one other place
# (netlify.toml NODE_VERSION); tests/repo-hygiene.test.js holds them together.

FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./

# ── dev: everything, so the suite and the linters run in here ────────────────
FROM base AS dev
RUN npm ci
COPY . .
ENV NODE_ENV=development
ENV FINTECH_API_PORT=3001
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1
CMD ["npm", "run", "dev"]

# ── prod: the runtime only ───────────────────────────────────────────────────
FROM base AS prod
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
ENV FINTECH_API_PORT=3001
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1
CMD ["node", "src/server.js"]
