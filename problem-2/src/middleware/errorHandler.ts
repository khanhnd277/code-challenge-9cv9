import { type NextFunction, type Request, type Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/AppError";
import { logger } from "../logger";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const isProd = process.env["NODE_ENV"] === "production";

  // ── 1. Malformed JSON body (body-parser SyntaxError) ─────────────────────
  // body-parser sets statusCode=400 and expose=true on JSON parse failures.
  // Without this check they fall through to the 500 handler.
  if (
    err instanceof SyntaxError &&
    (err as unknown as Record<string, unknown>)["statusCode"] === 400 &&
    (err as unknown as Record<string, unknown>)["expose"] === true
  ) {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  // ── 2. Zod validation errors ───────────────────────────────────────────────
  // These bubble up when a validator is called outside of a route's inline
  // safeParse block, e.g. in a shared middleware.
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      details: err.flatten().fieldErrors,
    });
    return;
  }

  // ── 3. Operational AppErrors ───────────────────────────────────────────────
  // Expected failures thrown intentionally (404, 409, 403, …).
  // Safe to forward the message to the client.
  if (err instanceof AppError && err.isOperational) {
    logger.warn({ method: req.method, url: req.url, status: err.statusCode }, err.message);
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // ── 4. Programming / unexpected errors ────────────────────────────────────
  // Unknown exceptions, type errors, DB driver failures, etc.
  // Log the full stack; never leak internals to the client.
  logger.error(
    { method: req.method, url: req.url, err },
    err instanceof Error ? err.message : "Unexpected error"
  );

  res.status(500).json({
    error: "Internal server error",
    // Only expose a hint in development to aid debugging
    ...(isProd ? {} : { detail: err instanceof Error ? err.stack : String(err) }),
  });
}
