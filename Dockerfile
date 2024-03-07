# syntax=docker/dockerfile:1.7-labs
FROM node:20-alpine3.18
RUN apk add git && apk add curl && mkdir -p /morcus/node_modules && mkdir -p /morcus/build
WORKDIR /morcus
COPY --chown=node:node ./ ./
RUN chown -R node:node /morcus

USER node
RUN npm ci --omit optional
RUN npm run build
RUN npm run tsnp src/esbuild/server.esbuild.ts && mv node_modules/better-sqlite3/build/Release/better_sqlite3.node ./build/

FROM node:20-alpine3.18
WORKDIR /morcus
COPY --from=0 /morcus/public public
COPY --from=0 /morcus/build build
COPY --from=0 /morcus/package.json package.json
RUN mv build/dbs/ /morcus_dbs/
RUN chown -R node:node /morcus

FROM node:20-alpine3.18
COPY --chown=node:node --from=1 /morcus_dbs /morcus/build/dbs
COPY --chown=node:node --from=1 /morcus /morcus
WORKDIR /morcus
ENV PORT="5757"
EXPOSE 5757
USER node
CMD [ "node", "build/server.js" ]
