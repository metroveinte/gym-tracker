FROM node:20-slim

WORKDIR /usr/src/app

COPY package*.json ./

ENV NODE_ENV=production
RUN npm install --production

COPY . ./

VOLUME ["/usr/src/app/data"]

EXPOSE 3005
CMD ["npm", "start"]
