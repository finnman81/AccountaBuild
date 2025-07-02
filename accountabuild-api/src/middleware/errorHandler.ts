import { Request, Response, NextFunction } from 'express';

interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

const errorHandler = (err: AppError, req: Request, res: Response, next: NextFunction) => {
  err.statusCode = err.statusCode || 500;
  err.message = err.message || 'Internal Server Error';

  // In development, send detailed error information
  if (process.env.NODE_ENV === 'development') {
    console.error('ERROR 💥', err);
    return res.status(err.statusCode).json({
      status: 'error',
      error: err,
      message: err.message,
      stack: err.stack,
    });
  }

  // In production, send a generic, operational error message
  // Log the full error for internal debugging
  console.error('ERROR 💥', err);
  if (err.isOperational) {
    // Operational, trusted error: send message to client
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
  }
  
  // Programming or other unknown error: don't leak error details
  return res.status(500).json({
    status: 'error',
    message: 'Something went very wrong!',
  });
};

export default errorHandler; 