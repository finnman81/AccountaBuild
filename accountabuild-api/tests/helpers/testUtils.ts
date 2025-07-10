import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { testPrisma } from '../setup';
import { JWT_SECRET } from '../../src/config/jwt';

export interface TestUser {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
}

export interface TestGroup {
  id: string;
  name: string;
  description: string | null;
}

// Create a test user
export async function createTestUser(overrides: Partial<TestUser> = {}): Promise<TestUser> {
  const defaultUser = {
    email: `test${Date.now()}@example.com`,
    username: `testuser${Date.now()}`,
    passwordHash: await bcrypt.hash('password123', 12),
  };

  const userData = { ...defaultUser, ...overrides };
  
  const user = await testPrisma.user.create({
    data: userData,
  });

  return user;
}

// Create a test group
export async function createTestGroup(overrides: Partial<TestGroup> = {}): Promise<TestGroup> {
  const defaultGroup = {
    name: `Test Group ${Date.now()}`,
    description: 'A test group for testing purposes',
  };

  const groupData = { ...defaultGroup, ...overrides };
  
  const group = await testPrisma.group.create({
    data: groupData,
  });

  return group;
}

// Generate JWT token for testing
export function generateTestToken(userId: string, email: string): string {
  return jwt.sign(
    { userId, email },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// Create authenticated user with token
export async function createAuthenticatedUser(): Promise<{ user: TestUser; token: string }> {
  const user = await createTestUser();
  const token = generateTestToken(user.id, user.email);
  
  return { user, token };
}

// Helper to extract error message from response
export function extractErrorMessage(response: any): string {
  return response.body?.error || response.body?.message || 'Unknown error';
} 