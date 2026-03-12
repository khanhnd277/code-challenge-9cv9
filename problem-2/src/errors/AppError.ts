/**
 * Operational error — an expected failure with a known HTTP status code
 * (e.g. 404 Not Found, 400 Bad Request, 409 Conflict).
 *
 * Throwing an AppError means "I handled this case intentionally".
 * The global error handler will forward the message to the client.
 *
 * Contrast with programming errors (TypeError, ReferenceError, etc.)
 * which are NOT AppErrors — those get a generic 500 response and their
 * details are only logged, never sent to the client.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    /** Set to false for unexpected errors you want to surface as AppError */
    public readonly isOperational = true
  ) {
    super(message);
    this.name = "AppError";
    // Maintains proper prototype chain in transpiled code
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
