export interface SuccessResponse<T> {
  success: true;
  data: T;
  requestId: string;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

export function successResponse<T>(data: T, requestId: string): SuccessResponse<T> {
  return { success: true, data, requestId };
}

export function errorResponse(
  code: string,
  message: string,
  requestId: string,
  details?: unknown
): ErrorResponse {
  return { success: false, error: { code, message, requestId, ...(details !== undefined ? { details } : {}) } };
}
