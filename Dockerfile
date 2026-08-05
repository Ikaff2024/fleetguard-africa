# syntax=docker/dockerfile:1

###############################################################################
# Étape 1 — Dépendances complètes (build)
###############################################################################
FROM node:22-alpine AS deps
WORKDIR /app

# Copier d'abord les manifestes : cette couche n'est reconstruite que si les
# dépendances changent réellement, pas à chaque modification de code.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

###############################################################################
# Étape 2 — Compilation
###############################################################################
FROM node:22-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Vite remplace les variables VITE_* à la compilation : toute valeur passée ici
# se retrouve dans le bundle public. N'y mettre aucun secret.
ENV NODE_ENV=production
RUN npm run build

###############################################################################
# Étape 3 — Dépendances d'exécution uniquement
###############################################################################
FROM node:22-alpine AS prod-deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

###############################################################################
# Étape 4 — Image finale
###############################################################################
FROM node:22-alpine AS runtime
WORKDIR /app

# `tini` assure la transmission des signaux : sans lui, un SIGTERM de
# l'orchestrateur n'atteint pas Node et l'arrêt gracieux ne s'exécute jamais.
RUN apk add --no-cache tini

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Ne jamais tourner en root : une faille applicative ne doit pas donner les
# pleins pouvoirs sur le conteneur.
USER node

EXPOSE 3000

# Sonde interne : l'orchestrateur retire l'instance du service si elle ne
# répond plus, sans attendre les plaintes des utilisateurs.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.cjs"]
