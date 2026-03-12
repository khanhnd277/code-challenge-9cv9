# Problem 2 — Express.js CRUD API

A RESTful CRUD API built with **Express.js**, **TypeScript**, **Drizzle ORM**, **SQLite** (dev/test) and **PostgreSQL** (production).

## Requirements

- Node.js >= 18
- npm >= 9
- Docker & Docker Compose (for containerised deployment)

---

## Docker (recommended)

The fastest way to run the full stack (app + PostgreSQL) with zero local setup.

### Start

```bash
docker compose up --build
```

- App: `http://localhost:3000`
- API docs: `http://localhost:3000/api-docs`
- PostgreSQL: `localhost:5432` (user `products_user`, db `products_db`)

On first start the app automatically pushes the schema to PostgreSQL before starting.

### Seed sample data

```bash
docker compose exec app node dist/db/seed.js
```

### Stop

```bash
docker compose down        # stop, keep DB volume
docker compose down -v     # stop and wipe DB volume (deletes all data)
```

### Built-in environment

All environment variables are defined directly in [docker-compose.yml](docker-compose.yml) — no `.env` file needed when using Docker.

| Variable | Docker value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `LOG_LEVEL` | `info` |
| `DATABASE_URL` | `postgres://products_user:products_pass@db:5432/products_db` |

---

## Setup & Run (local)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` as needed (see [Environment Variables](#environment-variables) below).

### 3. Start in development mode (hot reload)

```bash
npm run dev
```

Server starts at `http://localhost:3000`.
Interactive API docs available at `http://localhost:3000/api-docs`.

### 4. Build & run for production

```bash
npm run build
npm start
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development` \| `production` \| `test` |
| `PORT` | `3000` | Port the server binds to |
| `LOG_LEVEL` | `info` | `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` |
| `DATABASE_URL` | _(unset)_ | PostgreSQL connection URL. When set, SQLite is not used. |
| `DATABASE_PATH` | `./data.db` | SQLite file path. Use `:memory:` for disposable in-memory DB. |
| `DB_BUSY_TIMEOUT_MS` | `5000` | SQLite only — wait time (ms) when DB file is locked. |

---

## Database

The project supports two databases selected automatically via environment variables:

| Environment | Variable | Adapter |
|---|---|---|
| Development (default) | `DATABASE_PATH=./data.db` | SQLite (file) |
| Tests (automatic) | `DATABASE_PATH=:memory:` | SQLite (in-memory) |
| Production | `DATABASE_URL=postgres://...` | PostgreSQL |

### Database commands

```bash
# Sync schema directly to DB — quick setup, no migration files generated
npm run db:push

# Generate SQL migration files in ./drizzle/ (review before applying)
npm run db:generate

# Apply generated migration files to the DB
npm run db:migrate

# Insert 50 sample product records
npm run db:seed

# Open Drizzle Studio — visual DB browser
npm run db:studio
```

### Switching to PostgreSQL

1. Set `DATABASE_URL` in `.env` and remove or comment out `DATABASE_PATH`:
   ```
   DATABASE_URL=postgres://user:password@localhost:5432/mydb
   ```

2. Apply the schema:
   ```bash
   npm run db:push
   ```

   Or for production with reviewable migration files:
   ```bash
   npm run db:generate   # creates ./drizzle/0001_*.sql — review before applying
   npm run db:migrate    # applies the migration to the DB
   ```

   > **Important:** Always delete any previously generated `./drizzle/` folder before
   > running `db:generate` after switching dialects, otherwise the old SQLite migrations
   > will conflict with PostgreSQL.

3. (Optional) Seed sample data:
   ```bash
   npm run db:seed
   ```

### Re-seeding / resetting data

Running `db:seed` multiple times inserts duplicates. To reset first:

```bash
# PostgreSQL
psql $DATABASE_URL -c "TRUNCATE products;"
npm run db:seed

# SQLite
rm data.db          # app recreates the table on next start
npm run dev &
npm run db:seed
```

---

## Testing

Tests use an **in-memory SQLite database** automatically — they never touch `data.db` or any PostgreSQL instance.

```bash
npm test               # run all tests once
npm run test:watch     # re-run on file changes
npm run test:coverage  # generate coverage report in ./coverage/
```

---

## API Reference

Full interactive documentation with request/response schemas and a built-in request runner is available via Swagger UI once the server is running:

- **Swagger UI:** `http://localhost:3000/api-docs`
- **OpenAPI JSON:** `http://localhost:3000/api-docs.json`

---

## Project Structure

```
problem-2/
├── src/
│   ├── __tests__/
│   │   ├── jest.setup.ts         # Sets DATABASE_PATH=:memory: for all tests
│   │   └── products.test.ts      # CRUD endpoint tests
│   ├── db/
│   │   ├── index.ts              # DB factory — picks SQLite or PostgreSQL
│   │   ├── schema.ts             # SQLite table definitions (dev + test)
│   │   ├── schema.pg.ts          # PostgreSQL table definitions (production)
│   │   └── seed.ts               # Inserts 50 sample products (npm run db:seed)
│   ├── middleware/
│   │   └── errorHandler.ts       # Global error handler
│   ├── routes/
│   │   └── products.ts           # CRUD route handlers + OpenAPI JSDoc
│   ├── validators/
│   │   └── product.ts            # Zod validation schemas
│   ├── app.ts                    # Express app entry point
│   ├── config.ts                 # Centralised config from env vars
│   ├── logger.ts                 # Pino logger instance
│   └── swagger.ts                # OpenAPI spec definition
├── drizzle.config.ts             # Drizzle Kit config (auto-selects dialect)
├── Dockerfile                    # Multi-stage build (builder + production)
├── docker-compose.yml            # App + PostgreSQL with built-in env vars
├── .dockerignore
├── .env.example                  # Template for local environment variables
├── package.json
├── tsconfig.json
└── README.md
```
