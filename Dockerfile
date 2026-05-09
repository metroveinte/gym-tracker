FROM node:20-alpine

# Instalar git
RUN apk add --no-cache git

WORKDIR /usr/src/app

# Clonar el repo (se hace en build, pero para updates necesitas rebuild)
# Nota: Para updates automáticos, usa un script en el host

COPY package.json ./

ENV NODE_ENV=production
RUN npm install --production

COPY . ./

# Entrypoint opcional para git pull (pero no rebuild)
# ENTRYPOINT ["sh", "-c", "git pull origin main && npm start"]

VOLUME ["/usr/src/app/data"]

EXPOSE 3005
CMD ["npm", "start"]
