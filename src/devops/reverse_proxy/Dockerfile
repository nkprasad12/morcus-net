FROM nginx:1.30.4-alpine-slim@sha256:77da26c31397bf6694b4bf93275f5b40b0b120ba1b8f114264b603e592c561d6
COPY ./nginx.conf /nginx.template.conf
CMD envsubst '$PROD_HOST_NAMES,$DEV_HOST_NAMES,$HTTP_PORT' < /nginx.template.conf > /nginx.conf \
    && nginx -c /nginx.conf -p /home
