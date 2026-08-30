import type { FastifyInstance, FastifyError } from "fastify";

function clientError(code: string, message: string): FastifyError {
  const err = new Error(message) as FastifyError;
  err.statusCode = 400;
  err.code = code;
  err.name = "FastifyError";
  return err;
}

/**
 * Replaces Fastify's default `application/json` parser with one that behaves identically but
 * also stashes the exact raw string on `request.rawBody` first. Needed because Paystack signs
 * webhooks over the literal bytes it sent (HMAC-SHA512) — verifying against
 * `JSON.stringify(request.body)` would fail for any payload whose re-serialization doesn't
 * byte-match the original (key order, whitespace, number formatting), which is not something
 * to rely on. Every other route is unaffected: parsing behavior stays the same as Fastify's own
 * default, this just captures the string on the way through — including matching Fastify's own
 * error *shape* (`.statusCode`/`.code`) for a malformed/empty body, not just its outcome. A
 * plain `Error` with neither has no `.statusCode` for the global error handler to key off, so it
 * would've fallen through to a generic 500 instead of the 400 client error this always was.
 */
export function registerRawBodyCapture(app: FastifyInstance): void {
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, rawBody, done) => {
    // `{ parseAs: "string" }` guarantees a string at runtime — Fastify's own type declaration
    // just doesn't narrow the callback parameter based on that option.
    const body = rawBody as string;
    request.rawBody = body;

    if (body.length === 0) {
      done(
        clientError("FST_ERR_CTP_EMPTY_JSON_BODY", "Body cannot be empty when content-type is set to 'application/json'"),
        undefined
      );
      return;
    }
    try {
      done(null, JSON.parse(body));
    } catch {
      done(clientError("FST_ERR_CTP_INVALID_JSON_BODY", "Body is not valid JSON"), undefined);
    }
  });
}
