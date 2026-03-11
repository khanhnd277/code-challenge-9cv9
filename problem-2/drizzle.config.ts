import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env["DATABASE_URL"];
const databasePath = process.env["DATABASE_PATH"] ?? "./data.db";

export default databaseUrl
  ? // ── PostgreSQL ────────────────────────────────────────────────────────────
    defineConfig({
      dialect: "postgresql",
      schema: "./src/db/schema.pg.ts",
      out: "./drizzle",
      dbCredentials: { url: databaseUrl },
    })
  : // ── SQLite ────────────────────────────────────────────────────────────────
    defineConfig({
      dialect: "sqlite",
      schema: "./src/db/schema.ts",
      out: "./drizzle",
      dbCredentials: { url: databasePath },
    });
