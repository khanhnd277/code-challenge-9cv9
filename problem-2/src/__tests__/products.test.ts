import request from "supertest";
import app from "../app";
import { db } from "../db";
import { products } from "../db/schema";

// Clean up the products table before each test so tests are isolated
beforeEach(async () => {
  await db.delete(products);
});

describe("POST /api/products", () => {
  it("creates a product and returns 201", async () => {
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
      price: 19.99,
      category: "Electronics",
      stock: 50,
    });
    expect(res.body.data.id).toBeDefined();
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await request(app).post("/api/products").send({
      description: "Missing name, price, category",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });
});

describe("GET /api/products", () => {
  it("returns paginated product list", async () => {
    // Seed two products
    await request(app).post("/api/products").send({ name: "A", price: 10, category: "Cat1" });
    await request(app).post("/api/products").send({ name: "B", price: 20, category: "Cat2" });

    const res = await request(app).get("/api/products");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.total).toBe(2);
  });

  it("filters by category", async () => {
    await request(app).post("/api/products").send({ name: "A", price: 10, category: "Electronics" });
    await request(app).post("/api/products").send({ name: "B", price: 20, category: "Books" });

    const res = await request(app).get("/api/products?category=Electronics");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].category).toBe("Electronics");
  });
});

describe("GET /api/products/:id", () => {
  it("returns a product by id", async () => {
    const created = await request(app)
      .post("/api/products")
      .send({ name: "Widget", price: 5.99, category: "Tools" });

    const { id } = created.body.data;
    const res = await request(app).get(`/api/products/${id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(id);
  });

  it("returns 404 for unknown id", async () => {
    const res = await request(app).get("/api/products/non-existent-id");
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/products/:id", () => {
  it("updates a product", async () => {
    const created = await request(app)
      .post("/api/products")
      .send({ name: "Old Name", price: 9.99, category: "Tools" });

    const { id } = created.body.data;
    const res = await request(app)
      .put(`/api/products/${id}`)
      .send({ name: "New Name", price: 14.99 });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("New Name");
    expect(res.body.data.price).toBe(14.99);
  });

  it("returns 404 for unknown id", async () => {
    const res = await request(app)
      .put("/api/products/non-existent-id")
      .send({ name: "X" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/products/:id", () => {
  it("deletes a product and returns 204", async () => {
    const created = await request(app)
      .post("/api/products")
      .send({ name: "Delete Me", price: 1, category: "Misc" });

    const { id } = created.body.data;
    const deleteRes = await request(app).delete(`/api/products/${id}`);
    expect(deleteRes.status).toBe(204);

    const getRes = await request(app).get(`/api/products/${id}`);
    expect(getRes.status).toBe(404);
  });

  it("returns 404 for unknown id", async () => {
    const res = await request(app).delete("/api/products/non-existent-id");
    expect(res.status).toBe(404);
  });
});
