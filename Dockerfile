FROM node:20-alpine3.18

RUN apk add git && apk add curl && mkdir -p /home/node/morcus/node_modules
WORKDIR /home/node/morcus
COPY --chown=node:node src src
COPY --chown=node:node public public
COPY --chown=node:node texts texts
COPY --chown=node:node tsconfig.json tsconfig.json
COPY --chown=node:node package.json package.json
COPY --chown=node:node package-lock.json package-lock.json
COPY --chown=node:node .git .git
RUN chown -R node:node /home/node/morcus

USER node
RUN npm install
RUN npm run build
RUN npm prune --production
RUN rm -rf .git

FROM node:20-alpine3.18
ENV CONSOLE_TELEMETRY="yes" PORT="5656"
COPY --from=0 /home/node/morcus /home/node/morcus
WORKDIR /home/node/morcus
EXPOSE 5656
RUN chown -R node:node .
USER node
CMD [ "npm", "start" ]
