FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY scripts ./scripts
COPY dist ./dist
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5188 DATA_DIR=/app/data
EXPOSE 5188
VOLUME ["/app/data"]
CMD ["node", "--env-file-if-exists=.env", "server/index.mjs"]
