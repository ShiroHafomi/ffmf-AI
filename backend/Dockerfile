# FFMS Node/Express backend
FROM node:20-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm ci || npm install

COPY . .

EXPOSE 4000
CMD ["npm", "run", "start"]
