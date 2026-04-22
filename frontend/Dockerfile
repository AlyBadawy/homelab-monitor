# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Copy git history and generate version files from latest git tag
COPY .git ./.git
COPY scripts/generate-version.js ./scripts/
RUN apk add --no-cache git && node scripts/generate-version.js

COPY package.json ./
RUN npm install

COPY tsconfig.json tsconfig.node.json vite.config.ts tailwind.config.js postcss.config.js index.html ./
COPY public ./public
COPY src ./src

RUN npm run build

# ---- runtime stage ----
FROM nginx:1.27-alpine AS runtime

# Custom config: serve the SPA and proxy /api → backend service.
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
