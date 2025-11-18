// src/middleware/errorHandler.js

function notFound(req, res, next) {
  res.status(404).json({
    message: 'Route not found'
  });
}

// Error handler global
function errorHandler(err, req, res, next) {
  console.error('[ERROR]', err);

  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || 500;

  res.status(status).json({
    message: err.message || 'Internal server error'
  });
}

module.exports = {
  notFound,
  errorHandler
};
