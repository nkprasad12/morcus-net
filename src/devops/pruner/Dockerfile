# Pinned by digest so the base is part of this file, and so of the image's
# build context and tag (see src/scripts/helper_images/). Upgrading Node is a
# deliberate edit here.
FROM node:26-trixie-slim@sha256:e4db4c914bf8ad241bd24804fc25d272d89bad97e68cdc8a1414862790a02c39
WORKDIR /morcus
COPY --chown=node:node pruner.js ./pruner.js
ENV NODE_ENV=production
USER node
# `pruner.js` touches /tmp/pruner-healthy after each fully successful daily
# pass and removes it when a pass has errors. Report unhealthy if it's missing
# or older than 36h, so persistent failures show up in `docker compose ps`.
HEALTHCHECK --start-period=2h --interval=10m --timeout=30s --retries=1 \
  CMD ["node", "-e", "const s=require('fs').statSync('/tmp/pruner-healthy',{throwIfNoEntry:false});process.exit(s&&Date.now()-s.mtimeMs<129600000?0:1)"]
ENTRYPOINT ["node", "/morcus/pruner.js"]
