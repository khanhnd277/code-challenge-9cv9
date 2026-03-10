# Problem 2 — Express.js CRUD API

A RESTful CRUD API built with **Express.js**, **TypeScript**, **Drizzle ORM**, and **SQLite**.

## Requirements

- Node.js >= 18
- npm >= 9

## Setup & Run

### 1. Install dependencies

```bash
npm install
```

### 2. Start in development mode (with hot reload)

```bash
npm run dev
```

The server starts at `http://localhost:3000`.

### 3. Build for production

```bash
npm run build
npm start
```

### Environment Variables

| Variable | Default | Description           |
|----------|---------|-----------------------|
| `PORT`   | `3000`  | Port the server binds to |

The SQLite database file (`data.db`) is created automatically in the project root on first run.

---

## API Reference

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

| Field         | Type    | Required | Description              |
|---------------|---------|----------|--------------------------|
| `name`        | string  | Yes      | Product name (max 255)   |
| `description` | string  | No       | Description (max 1000)   |
| `price`       | number  | Yes      | Must be positive         |
| `category`    | string  | Yes      | Category label           |
| `stock`       | integer | No       | Default `0`              |

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

| Param       | Type    | Description                           |
|-------------|---------|---------------------------------------|
| `category`  | string  | Filter by exact category              |
| `minPrice`  | number  | Minimum price                         |
| `maxPrice`  | number  | Maximum price                         |
| `search`    | string  | Search in name or description         |
| `page`      | integer | Page number (default: `1`)            |
| `limit`     | integer | Items per page, max 100 (default: `10`) |

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

**Response `200`:**
```json
{ "data": { ... } }
```

**Response `404`:**
```json
{ "error": "Product not found" }
```

---

#### Update a product

```
PUT /api/products/:id
Content-Type: application/json
```

All fields are optional. Only provided fields are updated.

**Example:**

```bash
curl -X PUT http://localhost:3000/api/products/some-uuid \
  -H "Content-Type: application/json" \
  -d '{"price":799.99,"stock":30}'
```

**Response `200`:**
```json
{ "data": { ... } }
```

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

---

## Project Structure

```
problem-2/
├── src/
│   ├── db/
│   │   ├── index.ts          # SQLite connection & Drizzle setup
│   │   └── schema.ts         # Table schema definitions
│   ├── middleware/
│   │   └── errorHandler.ts   # Global error handler
│   ├── routes/
│   │   └── products.ts       # CRUD route handlers
│   ├── validators/
│   │   └── product.ts        # Zod validation schemas
│   └── app.ts                # Express app & server entry point
├── package.json
├── tsconfig.json
└── README.md
```
