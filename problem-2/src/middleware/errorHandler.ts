import { type NextFunction, type Request, type Response } from "express";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
}
