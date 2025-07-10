import { PrismaClient } from '@prisma/client';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.DATABASE_URL = 'file:./test.db';

// Create a test Prisma client with SQLite in-memory database
export const testPrisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:./test.db',
    },
  },
});

// Global test setup
beforeAll(async () => {
  // Apply migrations to test database
  console.log('Setting up test database...');
});

// Clean up after each test
afterEach(async () => {
  // Clean up test data - order matters due to foreign key constraints
  try {
    await testPrisma.message.deleteMany();
    await testPrisma.membership.deleteMany();
    await testPrisma.goal.deleteMany();
    await testPrisma.workoutRecord.deleteMany();
    await testPrisma.group.deleteMany();
    await testPrisma.user.deleteMany();
  } catch (error) {
    console.log('Cleanup error (expected for some tests):', error);
  }
});

// Global test teardown
afterAll(async () => {
  await testPrisma.$disconnect();
}); 