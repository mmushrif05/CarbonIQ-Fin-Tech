# CarbonIQ FinTech — API Container
#
# For local development only. Production uses Netlify Functions.
#
# Build:  docker build -t carboniq-fintech -f docker/Dockerfile .
# Run:    docker run -p 3001:3001 --env-file .env carboniq-fintech

FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --production

# Copy all source files
COPY . .

# Set environment
ENV NODE_ENV=production
ENV FINTECH_API_PORT=3001

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "server.js"]
