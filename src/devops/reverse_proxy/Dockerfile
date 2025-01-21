FROM nginx:1.26.2
COPY ./nginx.conf /nginx.template.conf
CMD envsubst '$PROD_HOST_NAMES,$DEV_HOST_NAMES,$HTTP_PORT' < /nginx.template.conf > /nginx.conf \
    && nginx -c /nginx.conf -p /home
