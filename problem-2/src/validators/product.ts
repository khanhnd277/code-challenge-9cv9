import { z } from "zod";

export const createProductSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().max(1000).optional(),
  price: z.number().positive("Price must be positive"),
  category: z.string().min(1, "Category is required").max(100),
  stock: z.number().int().min(0, "Stock cannot be negative").default(0),
});

export const updateProductSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  price: z.number().positive().optional(),
  category: z.string().min(1).max(100).optional(),
  stock: z.number().int().min(0).optional(),
});

export const listProductsSchema = z.object({
  category: z.string().optional(),
  minPrice: z.coerce.number().positive().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsSchema>;
