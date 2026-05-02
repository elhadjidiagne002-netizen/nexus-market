FROM node:20-alpine

WORKDIR /app

# Copier package.json en premier (cache layer npm install)
COPY package.json package-lock.json* ./

RUN npm install --production --no-audit --no-fund

# Copier le reste du code
COPY . .

EXPOSE 3000

# [FIX RAILWAY] Utiliser ${PORT:-3000} car Railway injecte son propre PORT
# Si PORT=8080 est injecté par Railway, le healthcheck sonde le bon port
HEALTHCHECK --interval=15s --timeout=8s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/ping || exit 1

CMD ["node", "server.js"]
