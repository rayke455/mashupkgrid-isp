/**
 * Typed application error hierarchy. Every thrown error a service raises should be one of
 * these so the API's global error handler can map it to the standard response envelope
 * without ever leaking a stack trace, SQL error, or internal path to the client.
 */
export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: string, message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION_ERROR", message, 422, details);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication is required") {
    super("UNAUTHORIZED", message, 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super("FORBIDDEN", message, 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super("NOT_FOUND", `${resource} was not found`, 404);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super("CONFLICT", message, 409, details);
    this.name = "ConflictError";
  }
}

export class RateLimitedError extends AppError {
  constructor(retryAfterSeconds?: number) {
    super("RATE_LIMITED", "Too many requests", 429, { retryAfterSeconds });
    this.name = "RateLimitedError";
  }
}

export class TenantSuspendedError extends AppError {
  constructor(message = "This tenant account is suspended") {
    super("TENANT_SUSPENDED", message, 403);
    this.name = "TenantSuspendedError";
  }
}

export class MaintenanceModeError extends AppError {
  constructor(message: string, retryAfter?: string | null) {
    super("MAINTENANCE_MODE", message, 503, { retryAfter });
    this.name = "MaintenanceModeError";
  }
}

export class AccountLockedError extends AppError {
  constructor(lockedUntil: Date) {
    super("ACCOUNT_LOCKED", "This account is temporarily locked due to failed login attempts", 423, {
      lockedUntil: lockedUntil.toISOString(),
    });
    this.name = "AccountLockedError";
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
