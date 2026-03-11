/**
 * @openapi
 * tags:
 *   name: Products
 *   description: Product management endpoints
 */

import { and, asc, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import { Router, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { db, products } from "../db";
import {
  createProductSchema,
  listProductsSchema,
  updateProductSchema,
} from "../validators/product";

const router = Router();

/**
 * @openapi
 * /api/products:
 *   post:
 *     summary: Create a new product
 *     tags: [Products]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateProductBody'
 *     responses:
 *       201:
 *         description: Product created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Product'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 */
// POST /api/products — Create a product
router.post("/", async (req: Request, res: Response) => {
  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const now = new Date().toISOString();
  const newProduct = {
    id: randomUUID(),
    ...parsed.data,
    createdAt: now,
    updatedAt: now,
  };

  const [created] = await db.insert(products).values(newProduct).returning();
  return res.status(201).json({ data: created });
});

/**
 * @openapi
 * /api/products:
 *   get:
 *     summary: List products with optional filters
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *         description: Minimum price
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *         description: Maximum price
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in name and description
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [name, price, stock, category, createdAt]
 *           default: createdAt
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort direction
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Paginated list of products
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedProducts'
 *       400:
 *         description: Invalid query parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 */
// GET /api/products — List products with filters
router.get("/", async (req: Request, res: Response) => {
  const parsed = listProductsSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid query parameters",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const { category, minPrice, maxPrice, search, sortBy, sortOrder, page, limit } = parsed.data;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (category) conditions.push(eq(products.category, category));
  if (minPrice !== undefined) conditions.push(gte(products.price, minPrice));
  if (maxPrice !== undefined) conditions.push(lte(products.price, maxPrice));
  if (search) {
    const term = `%${search.toLowerCase()}%`;
    conditions.push(
      or(
        sql`lower(${products.name}) like ${term}`,
        sql`lower(${products.description}) like ${term}`
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = products[sortBy as keyof typeof products] as Parameters<typeof asc>[0];
  const orderBy = sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn);

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(products)
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .where(where),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  return res.json({
    data: rows,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

/**
 * @openapi
 * /api/products/{id}:
 *   get:
 *     summary: Get a product by ID
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product UUID
 *     responses:
 *       200:
 *         description: Product details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Product'
 *       404:
 *         description: Product not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 */
// GET /api/products/:id — Get product by ID
router.get("/:id", async (req: Request, res: Response) => {
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, req.params.id))
    .limit(1);

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  return res.json({ data: product });
});

/**
 * @openapi
 * /api/products/{id}:
 *   put:
 *     summary: Update a product
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateProductBody'
 *     responses:
 *       200:
 *         description: Updated product
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Product'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       404:
 *         description: Product not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 */
// PUT /api/products/:id — Update a product
router.put("/:id", async (req: Request, res: Response) => {
  const [existing] = await db
    .select()
    .from(products)
    .where(eq(products.id, req.params.id))
    .limit(1);

  if (!existing) {
    return res.status(404).json({ error: "Product not found" });
  }

  const parsed = updateProductSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  if (Object.keys(parsed.data).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  const [updated] = await db
    .update(products)
    .set({ ...parsed.data, updatedAt: new Date().toISOString() })
    .where(eq(products.id, req.params.id))
    .returning();

  return res.json({ data: updated });
});

/**
 * @openapi
 * /api/products/{id}:
 *   patch:
 *     summary: Partially update a product (one or more fields)
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateProductBody'
 *           examples:
 *             price only:
 *               value: { "price": 19.99 }
 *             stock only:
 *               value: { "stock": 42 }
 *     responses:
 *       200:
 *         description: Updated product
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Product'
 *       400:
 *         description: Validation error or no fields provided
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       404:
 *         description: Product not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 */
// PATCH /api/products/:id — Partially update a product
router.patch("/:id", async (req: Request, res: Response) => {
  const [existing] = await db
    .select()
    .from(products)
    .where(eq(products.id, req.params.id))
    .limit(1);

  if (!existing) {
    return res.status(404).json({ error: "Product not found" });
  }

  const parsed = updateProductSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  if (Object.keys(parsed.data).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  const [updated] = await db
    .update(products)
    .set({ ...parsed.data, updatedAt: new Date().toISOString() })
    .where(eq(products.id, req.params.id))
    .returning();

  return res.json({ data: updated });
});

/**
 * @openapi
 * /api/products/{id}:
 *   delete:
 *     summary: Delete a product
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product UUID
 *     responses:
 *       204:
 *         description: Product deleted
 *       404:
 *         description: Product not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 */
// DELETE /api/products/:id — Delete a product
router.delete("/:id", async (req: Request, res: Response) => {
  const [existing] = await db
    .select()
    .from(products)
    .where(eq(products.id, req.params.id))
    .limit(1);

  if (!existing) {
    return res.status(404).json({ error: "Product not found" });
  }

  await db.delete(products).where(eq(products.id, req.params.id));

  return res.status(204).send();
});

export default router;
