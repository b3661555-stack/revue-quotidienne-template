FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx vite build && npm prune --omit=dev
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
VOLUME /data
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
