export class ApiError extends Error {
  constructor(status, error, message, details = '') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.error = error;
    this.details = details;
  }
}

export const isApiError = (error) => error instanceof ApiError;

export const createApiError = (status, error, message, details = '') =>
  new ApiError(status, error, message, details);

export const sendApiError = (res, error, fallback = {}) => {
  const status = isApiError(error) ? error.status : fallback.status || 500;
  const errorCode = isApiError(error) ? error.error : fallback.error || 'Internal Error';
  const message =
    (isApiError(error) ? error.message : error instanceof Error ? error.message : '') ||
    fallback.message ||
    'Unexpected server error.';
  const details =
    (isApiError(error) ? error.details : error instanceof Error ? error.message : '') ||
    fallback.details ||
    '';

  return res.status(status).json({
    success: false,
    error: errorCode,
    message,
    ...(details ? { details } : {}),
  });
};
