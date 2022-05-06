FROM node:16.14

COPY . /ransoim
WORKDIR /ransoim
RUN npm --registry https://registry.npm.taobao.org install -g typescript ts-node
RUN npm --registry https://registry.npm.taobao.org install 
ENTRYPOINT [ "ts-node", "/ransoim/index.ts" ]