import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { ZodError, z } from "zod";
import { AppError } from "../errors/AppError";
import { errorHandler } from "../middleware/errorHandler";

// Build a minimal Express app that throws a given error,
// then passes it to the error handler under test.
function buildApp(throwFn: (req: Request, res: Response, next: NextFunction) => void) {
  const app = express();
  app.use(express.json());
  app.get("/test", throwFn);
  app.use(errorHandler);
  return app;
}

describe("errorHandler", () => {
  // ── 1. Malformed JSON body ─────────────────────────────────────────────────
  describe("malformed JSON body", () => {
    it("returns 400 with 'Invalid JSON body' for body-parser SyntaxError", async () => {
      // body-parser emits a SyntaxError with statusCode=400 and expose=true
      const syntaxErr = Object.assign(new SyntaxError("Unexpected token"), {
        statusCode: 400,
        expose: true,
      });
      const app = buildApp((_req, _res, next) => next(syntaxErr));

      const res = await request(app).get("/test");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid JSON body");
    });

    it("does NOT treat a plain SyntaxError (no statusCode) as a JSON body error", async () => {
      const app = buildApp((_req, _res, next) => next(new SyntaxError("some other syntax error")));

      const res = await request(app).get("/test");

      // Falls through to the 500 handler
      expect(res.status).toBe(500);
    });

    it("does NOT treat statusCode=400 without expose=true as a JSON body error", async () => {
      const err = Object.assign(new SyntaxError("bad"), { statusCode: 400, expose: false });
      const app = buildApp((_req, _res, next) => next(err));

      const res = await request(app).get("/test");

      expect(res.status).toBe(500);
    });
  });

  // ── 2. ZodError ───────────────────────────────────────────────────────────
  describe("ZodError", () => {
    it("returns 400 with field-level details", async () => {
      let zodErr: ZodError;
      try {
        z.object({ name: z.string(), price: z.number() }).parse({ price: "not-a-number" });
      } catch (e) {
        zodErr = e as ZodError;
      }

      const app = buildApp((_req, _res, next) => next(zodErr!));
      const res = await request(app).get("/test");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation failed");
      expect(res.body.details).toBeDefined();
      expect(res.body.details.name).toBeDefined();
      expect(res.body.details.price).toBeDefined();
    });
  });

  // ── 3. AppError (operational) ─────────────────────────────────────────────
  describe("AppError — operational", () => {
    it("returns the AppError's statusCode and message", async () => {
      const app = buildApp((_req, _res, next) =>
        next(new AppError(404, "Product not found"))
      );
      const res = await request(app).get("/test");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Product not found");
    });

    it("returns 409 for conflict errors", async () => {
      const app = buildApp((_req, _res, next) =>
        next(new AppError(409, "Resource already exists"))
      );
      const res = await request(app).get("/test");

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("Resource already exists");
    });

    it("returns 403 for forbidden errors", async () => {
      const app = buildApp((_req, _res, next) =>
        next(new AppError(403, "Forbidden"))
      );
      const res = await request(app).get("/test");

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Forbidden");
    });
  });

  // ── AppError (non-operational) ────────────────────────────────────────────
  describe("AppError — non-operational", () => {
    it("falls through to 500 when isOperational=false", async () => {
      const app = buildApp((_req, _res, next) =>
        next(new AppError(500, "something broke", false))
      );
      const res = await request(app).get("/test");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Internal server error");
    });
  });

  // ── 4. Unexpected / programming errors ────────────────────────────────────
  describe("unexpected errors", () => {
    it("returns 500 for a generic Error", async () => {
      const app = buildApp((_req, _res, next) =>
        next(new Error("something exploded"))
      );
      const res = await request(app).get("/test");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Internal server error");
    });

    it("returns 500 for a TypeError", async () => {
      const app = buildApp((_req, _res, next) =>
        next(new TypeError("cannot read property of undefined"))
      );
      const res = await request(app).get("/test");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Internal server error");
    });

    it("returns 500 for a thrown string (non-Error value)", async () => {
      const app = buildApp((_req, _res, next) => next("raw string error"));
      const res = await request(app).get("/test");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Internal server error");
    });

    it("exposes stack detail in non-production environments", async () => {
      const original = process.env["NODE_ENV"];
      process.env["NODE_ENV"] = "development";

      const app = buildApp((_req, _res, next) => next(new Error("debug info")));
      const res = await request(app).get("/test");

      process.env["NODE_ENV"] = original;

      expect(res.status).toBe(500);
      expect(res.body.detail).toBeDefined();
    });

    it("does NOT expose stack detail in production", async () => {
      const original = process.env["NODE_ENV"];
      process.env["NODE_ENV"] = "production";

      const app = buildApp((_req, _res, next) => next(new Error("secret detail")));
      const res = await request(app).get("/test");

      process.env["NODE_ENV"] = original;

      expect(res.status).toBe(500);
      expect(res.body.detail).toBeUndefined();
    });
  });

  // ── Real-world: body-parser integration ───────────────────────────────────
  describe("real body-parser integration", () => {
    it("returns 400 when request body is invalid JSON", async () => {
      const app = buildApp((_req, res) => res.json({ ok: true }));

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .send('{"name": "x",}'); // trailing comma — invalid JSON

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid JSON body");
    });
  });
});
