FROM node:20-slim
WORKDIR /app/backend
COPY package.json .
RUN npm install
COPY . .
CMD ["node", "server.js"]
