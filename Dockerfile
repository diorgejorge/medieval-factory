# Estágio 1: dependências. Só invalida quando package*.json muda, então rebuilds ficam rápidos.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# Estágio 2: qualidade + build. Se lint, typecheck ou testes falharem, a imagem não é criada.
FROM deps AS build
COPY . .
RUN npm run lint && npm test && npm run build

# Estágio 3: só os arquivos estáticos servidos pelo nginx.
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
