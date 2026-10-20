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
# `.git` is excluded by `.dockerignore`, so `write_source_version.ts` reads
# the commit hash from `SOURCE_VERSION` instead of running `git rev-parse`.
ARG SOURCE_VERSION=local-docker-build
ENV SOURCE_VERSION=$SOURCE_VERSION
RUN npm run build

FROM node:22-trixie-slim
WORKDIR /morcus
COPY --from=0 /morcus/public public
COPY --from=0 /morcus/build build
COPY --from=0 /morcus/package.json package.json
COPY --from=0 /morcus/morceus-data morceus-data
COPY --from=0 /morcus/src/morceus src/morceus
# Move each large generated data directory into its own tree under `/layers`,
# laid out with its final path (e.g. `/layers/corpus/morcus/build/corpus`), so
# that each can be copied into the final image as a separate layer.
RUN for d in dbs corpus library_processed morceus; do \
      mkdir -p "/layers/$d/morcus/build" && mv "build/$d" "/layers/$d/morcus/build/"; \
    done
RUN chown -R node:node /morcus
# Normalise mtimes (including on the `morcus` and `build` parent directories)
# so that a layer's bytes depend only on the file contents.
RUN find /layers/ -exec touch -h -amt 200001010000.00 {} +

FROM node:22-trixie-slim
# Each data directory gets its own layer. With `--link`, a layer doesn't depend
# on the layers below it, and with normalised mtimes it's byte-identical (so
# reused by the registry and on `docker pull`) whenever its contents are.
# A typical code-only change then only re-downloads the small final layer.
#
# These are copied to `/` rather than to their final directories: copying into
# a directory that doesn't exist yet makes Docker create it with a fresh mtime,
# which changes the layer's digest on every build. Each tree already contains
# its parent directories (with normalised mtimes) instead.
COPY --chown=node:node --from=1 --link /layers/dbs/ /
COPY --chown=node:node --from=1 --link /layers/corpus/ /
COPY --chown=node:node --from=1 --link /layers/library_processed/ /
COPY --chown=node:node --from=1 --link /layers/morceus/ /
# Code, the client bundle, and the small per-build files (commit ID, build
# provenance), which change on every build.
COPY --chown=node:node --from=1 /morcus /morcus
WORKDIR /morcus
ENV PORT=5757 NODE_ENV=production
USER node
EXPOSE 5757
# Exec form, so node is PID 1 and receives SIGTERM / SIGINT from `docker stop`
# directly, letting it run its graceful shutdown in `start_server.ts`.
CMD ["node", "build/server.js"]
