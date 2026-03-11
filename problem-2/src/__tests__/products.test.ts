import request from "supertest";
import app from "../app";
import { db, products } from "../db";

beforeEach(async () => {
  await db.delete(products);
});

// ─── Helper ───────────────────────────────────────────────────────────────────
async function createProduct(overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/products")
    .send({ name: "Widget", price: 9.99, category: "Tools", stock: 10, ...overrides });
  return res.body.data;
}

// ─── POST /api/products ───────────────────────────────────────────────────────
describe("POST /api/products", () => {
  it("201 — creates a product with all fields", async () => {
    const res = await request(app).post("/api/products").send({
      name: "Test Mouse",
      description: "A test mouse",
      price: 19.99,
      category: "Electronics",
      stock: 50,
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: "Test Mouse",
      description: "A test mouse",
      price: 19.99,
      category: "Electronics",
      stock: 50,
    });
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.createdAt).toBeDefined();
    expect(res.body.data.updatedAt).toBeDefined();
  });

  it("201 — description defaults to null when omitted", async () => {
    const res = await request(app).post("/api/products").send({
      name: "No Desc",
      price: 5,
      category: "Misc",
    });
    expect(res.status).toBe(201);
    expect(res.body.data.description).toBeNull();
  });

  it("201 — stock defaults to 0 when omitted", async () => {
    const res = await request(app).post("/api/products").send({
      name: "No Stock",
      price: 5,
      category: "Misc",
    });
    expect(res.status).toBe(201);
    expect(res.body.data.stock).toBe(0);
  });

  it("400 — missing name", async () => {
    const res = await request(app).post("/api/products").send({ price: 5, category: "Misc" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(res.body.details.name).toBeDefined();
  });

  it("400 — missing price", async () => {
    const res = await request(app).post("/api/products").send({ name: "X", category: "Misc" });
    expect(res.status).toBe(400);
    expect(res.body.details.price).toBeDefined();
  });

  it("400 — missing category", async () => {
    const res = await request(app).post("/api/products").send({ name: "X", price: 5 });
    expect(res.status).toBe(400);
    expect(res.body.details.category).toBeDefined();
  });

  it("400 — negative price", async () => {
    const res = await request(app).post("/api/products").send({ name: "X", price: -1, category: "Misc" });
    expect(res.status).toBe(400);
    expect(res.body.details.price).toBeDefined();
  });

  it("400 — negative stock", async () => {
    const res = await request(app).post("/api/products").send({ name: "X", price: 1, category: "Misc", stock: -5 });
    expect(res.status).toBe(400);
    expect(res.body.details.stock).toBeDefined();
  });
});

// ─── GET /api/products ────────────────────────────────────────────────────────
describe("GET /api/products", () => {
  it("200 — returns paginated list", async () => {
    await createProduct({ name: "A" });
    await createProduct({ name: "B" });

    const res = await request(app).get("/api/products");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination).toMatchObject({ total: 2, page: 1, limit: 10, totalPages: 1 });
  });

  it("200 — empty list when no products", async () => {
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
  });

  it("200 — filters by category", async () => {
    await createProduct({ category: "Electronics" });
    await createProduct({ category: "Books" });

    const res = await request(app).get("/api/products?category=Electronics");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].category).toBe("Electronics");
  });

  it("200 — filters by minPrice", async () => {
    await createProduct({ price: 5 });
    await createProduct({ price: 50 });

    const res = await request(app).get("/api/products?minPrice=20");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].price).toBe(50);
  });

  it("200 — filters by maxPrice", async () => {
    await createProduct({ price: 5 });
    await createProduct({ price: 50 });

    const res = await request(app).get("/api/products?maxPrice=20");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].price).toBe(5);
  });

  it("200 — filters by minPrice and maxPrice combined", async () => {
    await createProduct({ price: 5 });
    await createProduct({ price: 20 });
    await createProduct({ price: 100 });

    const res = await request(app).get("/api/products?minPrice=10&maxPrice=50");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].price).toBe(20);
  });

  it("200 — search is case-insensitive by name", async () => {
    await createProduct({ name: "Wireless Mouse" });
    await createProduct({ name: "Keyboard" });

    const res = await request(app).get("/api/products?search=WIRELESS");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("Wireless Mouse");
  });

  it("200 — search matches description", async () => {
    await createProduct({ name: "Product A", description: "Ergonomic design" });
    await createProduct({ name: "Product B", description: "Standard model" });

    const res = await request(app).get("/api/products?search=ergonomic");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("Product A");
  });

  it("200 — sorts by price asc", async () => {
    await createProduct({ name: "Expensive", price: 100 });
    await createProduct({ name: "Cheap", price: 10 });

    const res = await request(app).get("/api/products?sortBy=price&sortOrder=asc");
    expect(res.status).toBe(200);
    expect(res.body.data[0].price).toBe(10);
    expect(res.body.data[1].price).toBe(100);
  });

  it("200 — sorts by price desc", async () => {
    await createProduct({ name: "Cheap", price: 10 });
    await createProduct({ name: "Expensive", price: 100 });

    const res = await request(app).get("/api/products?sortBy=price&sortOrder=desc");
    expect(res.status).toBe(200);
    expect(res.body.data[0].price).toBe(100);
    expect(res.body.data[1].price).toBe(10);
  });

  it("200 — sorts by name", async () => {
    await createProduct({ name: "Zebra" });
    await createProduct({ name: "Apple" });

    const res = await request(app).get("/api/products?sortBy=name&sortOrder=asc");
    expect(res.status).toBe(200);
    expect(res.body.data[0].name).toBe("Apple");
  });

  it("200 — pagination limit and page work correctly", async () => {
    for (let i = 1; i <= 5; i++) await createProduct({ name: `Product ${i}` });

    const page1 = await request(app).get("/api/products?limit=2&page=1&sortBy=name&sortOrder=asc");
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.pagination).toMatchObject({ total: 5, page: 1, limit: 2, totalPages: 3 });

    const page2 = await request(app).get("/api/products?limit=2&page=2&sortBy=name&sortOrder=asc");
    expect(page2.body.data).toHaveLength(2);
    expect(page2.body.pagination.page).toBe(2);

    const page3 = await request(app).get("/api/products?limit=2&page=3&sortBy=name&sortOrder=asc");
    expect(page3.body.data).toHaveLength(1);
  });

  it("400 — invalid sortBy value", async () => {
    const res = await request(app).get("/api/products?sortBy=invalid");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid query parameters");
  });

  it("400 — invalid sortOrder value", async () => {
    const res = await request(app).get("/api/products?sortOrder=random");
    expect(res.status).toBe(400);
  });

  it("400 — invalid page (zero)", async () => {
    const res = await request(app).get("/api/products?page=0");
    expect(res.status).toBe(400);
  });

  it("400 — invalid limit (over max)", async () => {
    const res = await request(app).get("/api/products?limit=200");
    expect(res.status).toBe(400);
  });
});

// ─── GET /api/products/:id ────────────────────────────────────────────────────
describe("GET /api/products/:id", () => {
  it("200 — returns the correct product", async () => {
    const product = await createProduct({ name: "Specific Item" });

    const res = await request(app).get(`/api/products/${product.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(product.id);
    expect(res.body.data.name).toBe("Specific Item");
  });

  it("404 — unknown id", async () => {
    const res = await request(app).get("/api/products/non-existent-id");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Product not found");
  });
});

// ─── PUT /api/products/:id ────────────────────────────────────────────────────
describe("PUT /api/products/:id", () => {
  it("200 — updates multiple fields", async () => {
    const product = await createProduct({ name: "Old Name", price: 9.99 });

    const res = await request(app)
      .put(`/api/products/${product.id}`)
      .send({ name: "New Name", price: 49.99 });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("New Name");
    expect(res.body.data.price).toBe(49.99);
  });

  it("200 — updatedAt is refreshed", async () => {
    const product = await createProduct();
    const before = product.updatedAt;

    await new Promise((r) => setTimeout(r, 10));
    const res = await request(app).put(`/api/products/${product.id}`).send({ stock: 99 });

    expect(res.status).toBe(200);
    expect(res.body.data.updatedAt).not.toBe(before);
  });

  it("400 — empty body returns no fields error", async () => {
    const product = await createProduct();
    const res = await request(app).put(`/api/products/${product.id}`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("No fields to update");
  });

  it("400 — invalid field value (negative price)", async () => {
    const product = await createProduct();
    const res = await request(app).put(`/api/products/${product.id}`).send({ price: -10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("404 — unknown id", async () => {
    const res = await request(app).put("/api/products/non-existent-id").send({ name: "X" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Product not found");
  });
});

// ─── PATCH /api/products/:id ──────────────────────────────────────────────────
describe("PATCH /api/products/:id", () => {
  it("200 — updates a single field (price)", async () => {
    const product = await createProduct({ price: 9.99 });

    const res = await request(app)
      .patch(`/api/products/${product.id}`)
      .send({ price: 19.99 });

    expect(res.status).toBe(200);
    expect(res.body.data.price).toBe(19.99);
    expect(res.body.data.name).toBe(product.name); // unchanged
  });

  it("200 — updates a single field (stock)", async () => {
    const product = await createProduct({ stock: 10 });

    const res = await request(app)
      .patch(`/api/products/${product.id}`)
      .send({ stock: 0 });

    expect(res.status).toBe(200);
    expect(res.body.data.stock).toBe(0);
  });

  it("200 — updates a single field (name)", async () => {
    const product = await createProduct({ name: "Original" });

    const res = await request(app)
      .patch(`/api/products/${product.id}`)
      .send({ name: "Renamed" });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Renamed");
  });

  it("200 — updates description to null (clear it)", async () => {
    const product = await createProduct({ description: "Some text" });

    const res = await request(app)
      .patch(`/api/products/${product.id}`)
      .send({ description: null });

    expect(res.status).toBe(200);
    expect(res.body.data.description).toBeNull();
  });

  it("400 — empty body returns no fields error", async () => {
    const product = await createProduct();
    const res = await request(app).patch(`/api/products/${product.id}`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("No fields to update");
  });

  it("400 — invalid field value (negative stock)", async () => {
    const product = await createProduct();
    const res = await request(app).patch(`/api/products/${product.id}`).send({ stock: -1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("404 — unknown id", async () => {
    const res = await request(app).patch("/api/products/non-existent-id").send({ price: 5 });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Product not found");
  });
});

// ─── DELETE /api/products/:id ─────────────────────────────────────────────────
describe("DELETE /api/products/:id", () => {
  it("204 — deletes the product", async () => {
    const product = await createProduct();

    const deleteRes = await request(app).delete(`/api/products/${product.id}`);
    expect(deleteRes.status).toBe(204);

    const getRes = await request(app).get(`/api/products/${product.id}`);
    expect(getRes.status).toBe(404);
  });

  it("404 — unknown id", async () => {
    const res = await request(app).delete("/api/products/non-existent-id");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Product not found");
  });
});
