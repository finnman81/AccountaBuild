"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JWT_SECRET = void 0;
/**
 * This module centralizes the JWT secret configuration.
 * It ensures that the application will not start without a
 * JWT_SECRET defined in the environment variables.
 */
function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        console.error('FATAL ERROR: JWT_SECRET is not defined in the environment variables.');
        process.exit(1);
    }
    return secret;
}
exports.JWT_SECRET = getJwtSecret();
