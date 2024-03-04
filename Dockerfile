FROM node:20-alpine3.18
RUN apk add git && apk add curl && mkdir -p /morcus/node_modules && mkdir -p /morcus/build
WORKDIR /morcus
COPY --chown=node:node templates templates
COPY --chown=node:node src src
COPY --chown=node:node public public
COPY --chown=node:node texts texts
COPY --chown=node:node tsconfig.json tsconfig.json
COPY --chown=node:node package.json package.json
COPY --chown=node:node package-lock.json package-lock.json
COPY --chown=node:node .git .git
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
RUN chown -R node:node /morcus

FROM node:20-alpine3.18
COPY --chown=node:node --from=1 /morcus /morcus
WORKDIR /morcus
ENV PORT="5757"
EXPOSE 5757
USER node
CMD [ "node", "build/server.js" ]
