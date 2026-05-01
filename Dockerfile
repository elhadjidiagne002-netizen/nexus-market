FROM node:20-alpine

WORKDIR /app

# Copier package.json en premier (cache layer npm install)
COPY package.json package-lock.json* ./

RUN npm install --production --no-audit --no-fund

# Copier le reste du code
COPY . .

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
