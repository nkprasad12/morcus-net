FROM nginx:1.24.0
COPY ./nginx.conf /nginx.template.conf
CMD envsubst '$PROD_HOST_NAMES,$DEV_HOST_NAMES' < /nginx.template.conf > /nginx.conf \
    && nginx -c /nginx.conf -p /home
