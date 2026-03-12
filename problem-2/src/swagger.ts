import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Products API",
      version: "1.0.0",
      description: "A CRUD REST API for managing products. Supports full update (PUT) and partial update (PATCH).",
    },
    components: {
      schemas: {
        Product: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid", example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" },
            name: { type: "string", example: "Wireless Mouse" },
            description: { type: "string", nullable: true, example: "Ergonomic wireless mouse" },
            price: { type: "number", example: 29.99 },
            category: { type: "string", example: "Electronics" },
            stock: { type: "integer", example: 100 },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        CreateProductBody: {
          type: "object",
          required: ["name", "price", "category"],
          properties: {
            name: { type: "string", example: "Wireless Mouse" },
            description: { type: "string", example: "Ergonomic wireless mouse" },
            price: { type: "number", minimum: 0, example: 29.99 },
            category: { type: "string", example: "Electronics" },
            stock: { type: "integer", minimum: 0, default: 0, example: 100 },
          },
        },
        UpdateProductBody: {
          type: "object",
          properties: {
            name: { type: "string", example: "Wireless Mouse Pro" },
            description: { type: "string", example: "Updated description" },
            price: { type: "number", minimum: 0, example: 39.99 },
            category: { type: "string", example: "Electronics" },
            stock: { type: "integer", minimum: 0, example: 50 },
          },
        },
        ValidationError: {
          type: "object",
          properties: {
            error: { type: "string", example: "Validation failed" },
            details: { type: "object", additionalProperties: { type: "array", items: { type: "string" } } },
          },
        },
        NotFoundError: {
          type: "object",
          properties: {
            error: { type: "string", example: "Product not found" },
          },
        },
        PaginatedProducts: {
          type: "object",
          properties: {
            data: { type: "array", items: { $ref: "#/components/schemas/Product" } },
            pagination: {
              type: "object",
              properties: {
                total: { type: "integer", example: 42 },
                page: { type: "integer", example: 1 },
                limit: { type: "integer", example: 10 },
                totalPages: { type: "integer", example: 5 },
              },
            },
          },
        },
      },
    },
  },
  // In development/test: parse TypeScript source files directly.
  // In production (Docker): src/ is absent, fall back to compiled JS in dist/.
  apis:
    process.env["NODE_ENV"] === "production"
      ? ["./dist/routes/*.js"]
      : ["./src/routes/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
