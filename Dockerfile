FROM node:20-alpine

WORKDIR /app

# Copy package manifests
COPY package.json package-lock.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy server files
COPY server/ ./server/

EXPOSE 3002

ENV NODE_ENV=production
ENV PORT=3002

CMD ["node", "server/index.js"]
