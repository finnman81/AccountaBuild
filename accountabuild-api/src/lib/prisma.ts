import { PrismaClient } from '@prisma/client';

// This prevents TypeScript from complaining about the global `prisma` object.
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// In development, we reuse the same PrismaClient instance across hot reloads
// to avoid creating too many connections. In production, a new instance is created once.
export const prisma = global.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
} 