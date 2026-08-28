export function notFound(req, res) {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    code: 'NOT_FOUND',
  });
}

export function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';
  const code = err.code || (status === 500 ? 'INTERNAL_ERROR' : 'ERROR');

  if (status >= 500) {
    console.error('[error]', {
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      user: req.user?.id,
    });
  }

  res.status(status).json({
    error: message,
    code,
    correlationId: req.correlationId || null,
    ...(process.env.NODE_ENV !== 'production' && status >= 500 ? { stack: err.stack } : {}),
  });
}

export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
