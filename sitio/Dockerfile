# Sitio de Paizap y documentación de Stellar MCU SDK: se compila con Node y se sirve con nginx.
#   docker build -t paizap-sitio .   &&   docker run --rm -p 8093:80 paizap-sitio

# --- compilar ---
FROM node:22-slim AS compilar
WORKDIR /sitio
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Dirección pública y carpeta base del sitio (ver astro.config.mjs).
ARG SITIO_URL=http://localhost:8093
ARG SITIO_BASE=/
RUN SITIO_URL=$SITIO_URL SITIO_BASE=$SITIO_BASE npm run build

# --- servir ---
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=compilar /sitio/dist /usr/share/nginx/html
EXPOSE 80
