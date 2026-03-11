import { sql } from "drizzle-orm";
import { doublePrecision, integer, pgTable, text } from "drizzle-orm/pg-core";

export const products = pgTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  price: doublePrecision("price").notNull(),
  category: text("category").notNull(),
  stock: integer("stock").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(now() AT TIME ZONE 'UTC')::text`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(now() AT TIME ZONE 'UTC')::text`),
});

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
