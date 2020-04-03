FROM node:lts-alpine3.9

# Create app directory
WORKDIR /usr/src/app/

# Install dependencies
RUN apk add --no-cache --virtual build-dependencies ca-certificates && \
  apk add --no-cache tini && \
  addgroup -S --gid 1001 user && \
  adduser -SDH -G user -u 1001 -s /bin/sh user

# Copy files
COPY package.json yarn.lock tsconfig.json ./

# Install npm dependencies
RUN yarn --pure-lockfile && \ 
  yarn cache clean

# Copy source files
COPY src src

# Compile files
RUN yarn build

# Use telegram user
USER user

# Expose container port
EXPOSE 8080

# Run Node app as child of tini
# Signal handling for PID1 https://github.com/krallin/tini
ENTRYPOINT ["/sbin/tini", "--"]

CMD [ "yarn", "start-no-build" ]
