import "dotenv/config";
import path from "path";

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  env: optional("NODE_ENV", "development"),
  port: parseInt(optional("PORT", "3000"), 10),

  db: {
    // Set DATABASE_URL to switch to PostgreSQL (e.g. production).
    // When set, DATABASE_PATH and busyTimeout are ignored.
    // Example: postgres://user:pass@localhost:5432/mydb
    url: process.env["DATABASE_URL"] ?? null,

    // SQLite only — path to the database file.
    // Use ":memory:" for a disposable in-memory DB (used by tests).
    path: optional("DATABASE_PATH", path.resolve(process.cwd(), "data.db")),

    // SQLite only — how long (ms) to wait when the DB file is locked.
    busyTimeout: parseInt(optional("DB_BUSY_TIMEOUT_MS", "5000"), 10),
  },

  log: {
    // "fatal" | "error" | "warn" | "info" | "debug" | "trace"
    level: optional("LOG_LEVEL", "info"),
    // pretty print in dev, structured JSON in prod/test
    pretty: optional("NODE_ENV", "development") === "development",
  },
};
