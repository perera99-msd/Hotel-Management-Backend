# Stage 1: Build the application
FROM node:20-alpine AS base
WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./

# Install dependencies
RUN npm ci || npm install

# Copy source code and configuration
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript to JavaScript
RUN npm run build

# Stage 2: Production runtime
FROM node:20-alpine AS runtime
WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

# Only copy production node_modules and built files
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY package.json ./package.json

# Expose the port defined in index.ts
EXPOSE 3000

# Run the compiled entry point
CMD ["node", "dist/index.js"]