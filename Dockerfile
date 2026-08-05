# syntax=docker/dockerfile:1

###############################################################################
# Étape 1 — Dépendances complètes (build)
###############################################################################
FROM node:22-alpine AS deps
WORKDIR /app

# Copier d'abord les manifestes : cette couche n'est reconstruite que si les
# dépendances changent réellement, pas à chaque modification de code.
# Le schéma Prisma est copié également car le hook `postinstall` génère le
# client, ce qui exige la présence du schéma.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
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

# Le client Prisma est régénéré ici : `COPY . .` vient d'écraser src/ avec le
# contenu du dépôt, où le client généré n'est pas versionné.
RUN npx prisma generate && npm run build

###############################################################################
# Étape 3 — Dépendances d'exécution uniquement
###############################################################################
FROM node:22-alpine AS prod-deps
WORKDIR /app

COPY package.json package-lock.json ./
# `--ignore-scripts` : la CLI Prisma est une dépendance de développement, donc
# absente ici. Le client généré est repris de l'étape de compilation.
RUN npm ci --omit=dev --no-audit --no-fund --ignore-scripts && npm cache clean --force

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

# `--chown` est indispensable : le conteneur tourne en utilisateur `node`, et
# le CLI Prisma doit pouvoir écrire dans node_modules lors des migrations.
# Sans cela, `migrate deploy` échoue sur un refus de permission.
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
# Client Prisma généré à la compilation.
COPY --from=build --chown=node:node /app/src/generated ./src/generated
# Schéma, migrations et scripts SQL : le conteneur prépare lui-même sa base au
# démarrage, ce qui évite d'exposer PostgreSQL publiquement pour migrer.
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node prisma.config.ts ./
COPY --chown=node:node scripts/start-production.mjs ./scripts/
COPY --chown=node:node package.json ./

# Ne jamais tourner en root : une faille applicative ne doit pas donner les
# pleins pouvoirs sur le conteneur.
USER node

EXPOSE 3000

# Sonde interne : l'orchestrateur retire l'instance du service si elle ne
# répond plus, sans attendre les plaintes des utilisateurs.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "scripts/start-production.mjs"]
