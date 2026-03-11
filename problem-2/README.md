# Problem 2 — Express.js CRUD API

A RESTful CRUD API built with **Express.js**, **TypeScript**, **Drizzle ORM**, **SQLite** (dev/test) and **PostgreSQL** (production).

## Requirements

- Node.js >= 18
- npm >= 9

---

## Setup & Run

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

Interactive docs (Swagger UI): `http://localhost:3000/api-docs`
Raw OpenAPI JSON spec: `http://localhost:3000/api-docs.json`

Base URL: `http://localhost:3000/api`

### Health check

```
GET /health
```

---

### Products

#### Create a product

```
POST /api/products
Content-Type: application/json
```

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Product name (max 255) |
| `description` | string | No | Description (max 1000) |
| `price` | number | Yes | Must be positive |
| `category` | string | Yes | Category label |
| `stock` | integer | No | Default `0` |

**Example:**

```bash
curl -X POST http://localhost:3000/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Laptop","price":999.99,"category":"Electronics","stock":50}'
```

**Response `201`:**
```json
{
  "data": {
    "id": "uuid",
    "name": "Laptop",
    "description": null,
    "price": 999.99,
    "category": "Electronics",
    "stock": 50,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

#### List products

```
GET /api/products
```

**Query parameters:**

| Param | Type | Description |
|---|---|---|
| `category` | string | Filter by exact category |
| `minPrice` | number | Minimum price |
| `maxPrice` | number | Maximum price |
| `search` | string | Case-insensitive search in name and description |
| `sortBy` | string | Sort field: `name`, `price`, `stock`, `category`, `createdAt` (default: `createdAt`) |
| `sortOrder` | string | `asc` or `desc` (default: `desc`) |
| `page` | integer | Page number (default: `1`) |
| `limit` | integer | Items per page, max 100 (default: `10`) |

**Example:**

```bash
curl "http://localhost:3000/api/products?category=Electronics&minPrice=100&page=1&limit=5"
```

**Response `200`:**
```json
{
  "data": [...],
  "pagination": {
    "total": 42,
    "page": 1,
    "limit": 5,
    "totalPages": 9
  }
}
```

---

#### Get a product

```
GET /api/products/:id
```

**Example:**

```bash
curl http://localhost:3000/api/products/some-uuid
```

**Response `200`:** `{ "data": { ... } }`
**Response `404`:** `{ "error": "Product not found" }`

---

#### Update a product (full)

```
PUT /api/products/:id
Content-Type: application/json
```

All fields are optional. Only provided fields are updated. Use when sending multiple fields at once.

**Example:**

```bash
curl -X PUT http://localhost:3000/api/products/some-uuid \
  -H "Content-Type: application/json" \
  -d '{"price":799.99,"stock":30}'
```

**Response `200`:** `{ "data": { ... } }`
**Response `404`:** `{ "error": "Product not found" }`

---

#### Partially update a product

```
PATCH /api/products/:id
Content-Type: application/json
```

Send only the single field you want to change. Semantically preferred over `PUT` for single-field updates.

**Fields:** `name`, `description`, `price`, `category`, `stock` — all optional, at least one required.

**Examples:**

```bash
# Update price only
curl -X PATCH http://localhost:3000/api/products/some-uuid \
  -H "Content-Type: application/json" \
  -d '{"price":19.99}'

# Update stock only
curl -X PATCH http://localhost:3000/api/products/some-uuid \
  -H "Content-Type: application/json" \
  -d '{"stock":0}'
```

**Response `200`:** `{ "data": { ... } }`
**Response `400`:** `{ "error": "No fields to update" }` — if body is empty
**Response `404`:** `{ "error": "Product not found" }`

---

#### Delete a product

```
DELETE /api/products/:id
```

**Example:**

```bash
curl -X DELETE http://localhost:3000/api/products/some-uuid
```

**Response `204`:** No content.
**Response `404`:** `{ "error": "Product not found" }`

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
├── .env.example                  # Template for environment variables
├── package.json
├── tsconfig.json
└── README.md
```
