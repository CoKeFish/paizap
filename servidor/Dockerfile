# Servidor de Toki con la web adentro: la misma dirección atiende al terminal, a la web y a la app.
# El contexto de build es la raíz del repo (lo pone compose.yaml):
#   docker build -t toki-servidor -f servidor/Dockerfile .

# --- web: compila app/ ---
FROM node:22-slim AS web
WORKDIR /web
COPY app/package.json app/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY app ./
RUN npm run build

# --- servidor ---
FROM node:22-slim
WORKDIR /app
COPY servidor/package.json servidor/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY servidor/src ./src
COPY --from=web /web/dist ./publico
EXPOSE 8080
CMD ["node", "src/servidor.mjs"]
