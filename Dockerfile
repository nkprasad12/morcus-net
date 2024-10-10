# syntax=docker/dockerfile:1.7-labs
FROM node:22-alpine3.20
RUN apk add git && apk add curl && mkdir -p /morcus/node_modules && mkdir -p /morcus/build
WORKDIR /morcus
COPY --chown=node:node ./ ./
RUN chown -R node:node /morcus

USER node
RUN npm ci --omit optional
RUN git clone --depth 1 https://github.com/nkprasad12/morpheus.git
RUN MORPHEUS_ROOT=/morcus/morpheus npm run build

FROM node:22-alpine3.20
WORKDIR /morcus
COPY --from=0 /morcus/public public
COPY --from=0 /morcus/build build
COPY --from=0 /morcus/package.json package.json
COPY --from=0 /morcus/morpheus morpheus
COPY --from=0 /morcus/src/morceus src/morceus
RUN mv build/dbs/ /morcus_dbs/
RUN chown -R node:node /morcus
RUN find /morcus_dbs/ -exec touch -amt 200001010000.00 {} +

FROM node:22-alpine3.20
# We have to do this elaborate dance because Docker annoyingly has
# no way to copy the database files without invalidating the layer cache,
# (even the the `.db` hash is exactly the same) except to the root directory.
COPY --chown=node:node --from=1 --link /morcus_dbs/*.db /
RUN mkdir -p /morcus/build/dbs
COPY --chown=node:node --from=1 /morcus /morcus
WORKDIR /morcus
EXPOSE 5757
CMD mv /*.db build/dbs/ \
      &&  chown -R node:node build/dbs \
      || echo "No databases to move."; \
    su node -c 'cd /morcus && PORT=5757 MORPHEUS_ROOT=/morcus/morpheus node build/server.js'
