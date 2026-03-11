import "dotenv/config";
import { config } from "../config";
import { logger } from "../logger";

// ─── PostgreSQL ───────────────────────────────────────────────────────────────
// Activated when DATABASE_URL is set (e.g. production).
// Schema uses pgTable / doublePrecision instead of sqliteTable / real.
// Run `npx drizzle-kit push` after switching to apply the schema to Postgres.
// ─── SQLite ───────────────────────────────────────────────────────────────────
// Default for development and tests.
// Tests set DATABASE_PATH=:memory: so they never touch data.db.

function createDb() {
  if (config.db.url) {
    const postgres = require("postgres");
    const { drizzle } = require("drizzle-orm/postgres-js");
    const schema = require("./schema.pg");

    const client = postgres(config.db.url);
    logger.info({ url: config.db.url.replace(/:\/\/.*@/, "://<credentials>@") }, "Database connected (PostgreSQL)");

    return {
      db: drizzle(client, { schema }),
      products: schema.products as typeof import("./schema.pg").products,
    };
  }

  const Database = require("better-sqlite3");
  const { drizzle } = require("drizzle-orm/better-sqlite3");
  const schema = require("./schema");

  const sqlite = new Database(config.db.path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma(`busy_timeout = ${config.db.busyTimeout}`);
  sqlite.pragma("foreign_keys = ON");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      category TEXT NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  logger.info({ path: config.db.path }, "Database connected (SQLite)");

  return {
    db: drizzle(sqlite, { schema }),
    products: schema.products as typeof import("./schema").products,
  };
}

const { db, products } = createDb();

export { db, products };
