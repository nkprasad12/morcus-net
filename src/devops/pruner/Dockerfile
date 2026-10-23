# Pinned by digest so the base is part of this file, and so of the image's
# build context and tag (see src/scripts/helper_images/). Upgrading Node is a
# deliberate edit here.
FROM node:22-trixie-slim@sha256:8eb619e402eaede1748a3c8173bffab391592812e85136452f781741c7242ddf
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
