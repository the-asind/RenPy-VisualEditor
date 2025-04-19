
FROM node:slim AS build

WORKDIR /app

COPY package*.json ./

RUN npm install --save-dev terser-brunch
RUN npm install --unsafe-perm --no-audit --no-fund --prefer-offline
RUN npm rebuild esbuild --platform=linux --arch=x64

COPY . .

ARG VITE_API_URL=http://localhost:8000/api
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build --production
RUN npm prune --production

FROM nginx:stable-alpine

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
