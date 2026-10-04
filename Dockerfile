FROM node:22-trixie-slim AS build

WORKDIR /app

RUN corepack enable

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm run build

FROM node:22-trixie-slim AS runtime

WORKDIR /app

COPY package.json ./package.json

RUN corepack enable \
    && corepack prepare "$(node -p 'require("./package.json").packageManager')" --activate

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates gnupg wget \
    && install -d /usr/share/keyrings \
    && wget -qO- https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] https://apt.postgresql.org/pub/repos/apt trixie-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-18 \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="/usr/lib/postgresql/18/bin:${PATH}"

RUN pg_dump --version | grep -Eq ' 18\.' \
    && pg_restore --version | grep -Eq ' 18\.'

COPY --from=build /app/artifacts/api-server/dist ./artifacts/api-server/dist

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
