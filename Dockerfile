# syntax=docker/dockerfile:1.7-labs
FROM node:22-trixie-slim
RUN apt-get update && apt-get install -y git curl build-essential && mkdir -p /morcus/node_modules && mkdir -p /morcus/build
WORKDIR /morcus
# We automatically load a .env file in node commands for the purposes
# of local development, so just create one so that we don't need to make separate
# commands.
RUN touch .env
COPY --chown=node:node ./ ./
RUN chown -R node:node /morcus

USER node
RUN npm ci
RUN npm run build

FROM node:22-trixie-slim
WORKDIR /morcus
COPY --from=0 /morcus/public public
COPY --from=0 /morcus/build build
COPY --from=0 /morcus/package.json package.json
COPY --from=0 /morcus/morceus-data morceus-data
COPY --from=0 /morcus/src/morceus src/morceus
RUN mkdir /morcus_dbs && mv build/dbs/ /morcus_dbs/dbs/
RUN chown -R node:node /morcus
RUN find /morcus_dbs/ -exec touch -amt 200001010000.00 {} +

FROM node:22-trixie-slim
# We have to do this elaborate dance because Docker annoyingly has
# no way to copy the database files without invalidating the layer cache,
# (even the the `.db` hash is exactly the same) except to the root directory.
# Copying the `/morcus_dbs/` contents to `/` brings the `dbs` directory along
# with its normalised mtime, so the layer is still byte-identical (and so
# reused by the registry and on `docker pull`) whenever the databases are.
COPY --chown=node:node --from=1 --link /morcus_dbs/ /
COPY --chown=node:node --from=1 /morcus /morcus
# The databases are read-only, so a symlink is enough to put them where the
# server expects them. Moving them at runtime instead would copy all of them
# into the container's writable layer on every container start.
RUN ln -s /dbs /morcus/build/dbs
WORKDIR /morcus
ENV PORT=5757 NODE_ENV=production
USER node
EXPOSE 5757
# Exec form, so node is PID 1 and receives SIGTERM / SIGINT from `docker stop`
# directly, letting it run its graceful shutdown in `start_server.ts`.
CMD ["node", "build/server.js"]
