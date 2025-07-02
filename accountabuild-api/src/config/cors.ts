import { CorsOptions } from 'cors';

// Define the allowed origins. In a real application, you would have separate
// URLs for development, staging, and production.
const allowedOrigins: string[] = [
  process.env.FRONTEND_URL || 'http://localhost:3000', // Default for local dev
  // Add other allowed origins here (e.g., your production frontend URL)
];

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true, // Allow cookies to be sent
}; 