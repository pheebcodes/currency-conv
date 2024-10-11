FROM oven/bun:latest

COPY package.json bun.lockb ./
COPY source ./source

RUN bun install
EXPOSE 3000
CMD [ "bun", "run", "start" ]