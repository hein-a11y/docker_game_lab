FROM nginx:alpine
RUN rm -rf /usr/share/nginx/html/*
COPY index.html style.css game.js /usr/share/nginx/html/
EXPOSE 80
