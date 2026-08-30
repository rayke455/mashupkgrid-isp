import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError, z } from "zod";
import { ValidationError, ForbiddenError, NotFoundError, RateLimitedError } from "@mashupkgrid/shared";
import { registerErrorHandler } from "../error-handler.js";

describe("global error handler", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    registerErrorHandler(app);

    app.get("/boom/app-error", async () => {
      throw new ValidationError("bad input", { field: "email" });
    });
    app.get("/boom/forbidden", async () => {
      throw new ForbiddenError();
    });
    app.get("/boom/not-found", async () => {
      throw new NotFoundError("Customer");
    });
    app.get("/boom/zod", async () => {
      z.object({ email: z.string().email() }).parse({ email: "not-an-email" });
    });
    app.get("/boom/unknown", async () => {
      throw new Error("something exploded with a secret /etc/passwd path");
    });
    // Mirrors exactly what @fastify/rate-limit does internally:
    // `throw params.errorResponseBuilder(req, ctx)` — a regression test for a live-tested bug
    // where errorResponseBuilder returned a plain object instead of an AppError instance, which
    // this handler couldn't recognize and fell through to a generic 500 instead of 429.
    app.get("/boom/rate-limited", async () => {
      throw new RateLimitedError(42);
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("maps AppError subclasses to their status code and code, never leaking internals", async () => {
    const res = await app.inject({ method: "GET", url: "/boom/app-error" });
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.requestId).toBeTruthy();
    expect(body.error.details).toEqual({ field: "email" });
  });

  it("maps ForbiddenError to 403", async () => {
    const res = await app.inject({ method: "GET", url: "/boom/forbidden" });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  it("maps NotFoundError to 404", async () => {
    const res = await app.inject({ method: "GET", url: "/boom/not-found" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  it("maps a raw ZodError to 422 VALIDATION_ERROR", async () => {
    const res = await app.inject({ method: "GET", url: "/boom/zod" });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("maps unknown errors to a generic 500 without leaking the original message", async () => {
    const res = await app.inject({ method: "GET", url: "/boom/unknown" });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(body.error.message).not.toContain("/etc/passwd");
    expect(JSON.stringify(body)).not.toContain("/etc/passwd");
  });

  it("returns the standard envelope shape with a requestId on every error", async () => {
    const res = await app.inject({ method: "GET", url: "/boom/unknown" });
    const body = res.json();
    expect(body).toEqual({
      success: false,
      error: {
        code: expect.any(String),
        message: expect.any(String),
        requestId: expect.any(String),
      },
    });
  });

  it("maps RateLimitedError to 429 with a retryAfterSeconds detail, as @fastify/rate-limit's thrown errorResponseBuilder result", async () => {
    const res = await app.inject({ method: "GET", url: "/boom/rate-limited" });
    expect(res.statusCode).toBe(429);
    const body = res.json();
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.details).toEqual({ retryAfterSeconds: 42 });
  });

  it("returns a 404 envelope for an unregistered route", async () => {
    const res = await app.inject({ method: "GET", url: "/this-route-does-not-exist" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });
});
