import type { FastifyInstance, FastifyError } from "fastify";
import { ZodError } from "zod";
import { isAppError, errorResponse } from "@mashupkgrid/shared";

/**
 * Global error handler. Never leaks stack traces, SQL, or internal paths to the client
 * (project instruction §38) — logs the full error server-side, returns only a code/message/
 * requestId to the caller.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | ZodError | Error, request, reply) => {
    const requestId = request.id;

    if (isAppError(err)) {
      request.log.warn({ err, requestId }, "handled application error");
      reply.status(err.statusCode).send(errorResponse(err.code, err.message, requestId, err.details));
      return;
    }

    if (err instanceof ZodError) {
      request.log.warn({ err, requestId }, "validation error");
      reply
        .status(422)
        .send(errorResponse("VALIDATION_ERROR", "Request validation failed", requestId, err.flatten()));
      return;
    }

    const fastifyErr = err as FastifyError;
    if (fastifyErr.statusCode && fastifyErr.statusCode < 500) {
      request.log.warn({ err, requestId }, "client error");
      reply
        .status(fastifyErr.statusCode)
        .send(errorResponse(fastifyErr.code ?? "BAD_REQUEST", fastifyErr.message, requestId));
      return;
    }

    request.log.error({ err, requestId }, "unhandled error");
    reply
      .status(500)
      .send(errorResponse("INTERNAL_SERVER_ERROR", "An unexpected error occurred", requestId));
  });

  app.setNotFoundHandler((request, reply) => {
    reply
      .status(404)
      .send(errorResponse("NOT_FOUND", "The requested route was not found", request.id));
  });
}
