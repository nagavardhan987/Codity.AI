FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build || true # If there's a build script
# (Since it uses tsx, we can just run it with tsx in production or transpile it, we'll use tsx for simplicity)

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./
# Install tsx globally or locally
RUN npm install -g tsx

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000
CMD ["npm", "run", "dev"]
