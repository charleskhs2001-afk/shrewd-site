# Container for Google Cloud Run (London, europe-west2). See DEPLOY-CLOUDRUN.md.
# Runs in the UK because Bing Shopping only returns UK results to UK addresses.
FROM node:20-slim
WORKDIR /app
COPY . .
ENV NODE_ENV=production
CMD ["node", "server.mjs"]
