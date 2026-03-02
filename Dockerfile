FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY index.js ./
COPY public ./public

EXPOSE 3000

CMD ["npm", "run", "start"]
