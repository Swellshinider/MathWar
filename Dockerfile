FROM node:22.22.3-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY packages/game-engine/package.json packages/game-engine/package.json

RUN npm ci

COPY . .

RUN npm run build:production

EXPOSE 3000

CMD ["npm", "run", "server:start"]
