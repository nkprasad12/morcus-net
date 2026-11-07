# nginx Stable only (even minor versions); `images.test.ts` enforces this, and
# .github/dependabot.yml ignores the odd (Mainline) minors.
FROM nginx:1.31.7-alpine-slim@sha256:ebd058041a732a2b2dc0b606e34572dd8e0034de6a4aa4d50d8c13a240ac6005
COPY ./nginx.conf /nginx.template.conf
CMD envsubst '$PROD_HOST_NAMES,$DEV_HOST_NAMES,$HTTP_PORT' < /nginx.template.conf > /nginx.conf \
    && nginx -c /nginx.conf -p /home
