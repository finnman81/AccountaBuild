/**
 * This module centralizes the JWT secret configuration.
 * It ensures that the application will not start without a
 * JWT_SECRET defined in the environment variables.
 */
function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('FATAL ERROR: JWT_SECRET is not defined in the environment variables.');
      process.exit(1);
    }
    return secret;
}

export const JWT_SECRET = getJwtSecret(); 