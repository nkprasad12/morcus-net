FROM nginx:1.24.0
COPY ./nginx.conf /nginx.conf
CMD ["nginx", "-c", "/nginx.conf", "-p", "/home", "-g", "daemon off;"]