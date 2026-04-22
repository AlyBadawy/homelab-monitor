# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# better-sqlite3 is a native module — needs build tools in the builder.
RUN apk add --no-cache python3 make g++ git

# Copy git history and generate version files from latest git tag
COPY .git ./.git
COPY scripts/generate-version.js ./scripts/
RUN node scripts/generate-version.js

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Strip dev deps for the runtime image.
RUN npm prune --omit=dev

# ---- runtime stage ----
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=4000 \
    DATA_DIR=/data

# better-sqlite3's native .node is already compiled against node 20 alpine in build stage.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

RUN mkdir -p /data

EXPOSE 4000

CMD ["node", "dist/index.js"]
