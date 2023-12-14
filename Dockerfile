FROM node
ENV NODE_ENV=production

WORKDIR /usr/app
COPY ["package.json", "package-lock.json*", "npm-shrinkwrap.json*", "./"]

RUN npm install

COPY . .

RUN yarn
RUN yarn build
RUN mkdir logs

EXPOSE 3000

CMD node dist/DataProvider.js -c configs/config-mainnet.json