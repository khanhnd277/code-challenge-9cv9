// Force tests to use an in-memory SQLite database.
// This must run before any module is imported, so it is listed under
// "setupFiles" in the Jest config (not "setupFilesAfterFramework").
process.env["DATABASE_PATH"] = ":memory:";

// Set DATABASE_URL to empty string — do NOT delete it.
// dotenv/config (used inside db/index.ts) only sets a key when it does NOT
// already exist in process.env. Deleting the key lets dotenv re-read the real
// DATABASE_URL from .env, accidentally connecting tests to the real database.
// An empty string is already "set", so dotenv skips it, and `if (config.db.url)`
// evaluates to false → SQLite is used.
process.env["DATABASE_URL"] = "";
