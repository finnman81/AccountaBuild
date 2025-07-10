import request from 'supertest';
import express from 'express';
import authRouter from '../../src/routes/auth';
import { testPrisma } from '../setup';
import { createTestUser, extractErrorMessage } from '../helpers/testUtils';

// Create test app
const app = express();
app.use(express.json());
app.use('/auth', authRouter);

describe('Auth Routes', () => {
  describe('POST /auth/register', () => {
    const validUserData = {
      email: 'test@example.com',
      username: 'testuser',
      password: 'password123',
    };

    it('should register a new user successfully', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send(validUserData)
        .expect(201);

      expect(response.body).toHaveProperty('message', 'User registered successfully');
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('token');
      expect(response.body.user).not.toHaveProperty('passwordHash');
      expect(response.body.user.email).toBe(validUserData.email.toLowerCase());
      expect(response.body.user.username).toBe(validUserData.username.toLowerCase());
    });

    it('should reject registration with missing fields', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({ email: 'test@example.com' })
        .expect(400);

      expect(response.body).toHaveProperty('errors');
      expect(Array.isArray(response.body.errors)).toBe(true);
    });

    it('should reject registration with invalid email', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          ...validUserData,
          email: 'invalid-email',
        })
        .expect(400);

      expect(response.body).toHaveProperty('errors');
    });

    it('should reject registration with weak password', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          ...validUserData,
          password: '123',
        })
        .expect(400);

      expect(response.body).toHaveProperty('errors');
    });

    it('should reject registration with duplicate email', async () => {
      await createTestUser({ email: validUserData.email });

      const response = await request(app)
        .post('/auth/register')
        .send(validUserData)
        .expect(409);

      expect(extractErrorMessage(response)).toContain('already exists');
    });

    it('should reject registration with duplicate username', async () => {
      await createTestUser({ username: validUserData.username });

      const response = await request(app)
        .post('/auth/register')
        .send(validUserData)
        .expect(409);

      expect(extractErrorMessage(response)).toContain('already exists');
    });

    it('should handle case insensitive email and username', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          ...validUserData,
          email: 'TEST@EXAMPLE.COM',
          username: 'TESTUSER',
        })
        .expect(201);

      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.user.username).toBe('testuser');
    });
  });

  describe('POST /auth/login', () => {
    const userCredentials = {
      email: 'login@example.com',
      password: 'password123',
    };

    beforeEach(async () => {
      await createTestUser({
        email: userCredentials.email,
        username: 'loginuser',
      });
    });

    it('should login successfully with valid credentials', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send(userCredentials)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Login successful');
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('token');
      expect(response.body.user).not.toHaveProperty('passwordHash');
      expect(response.body.user.email).toBe(userCredentials.email);
    });

    it('should reject login with invalid email', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: userCredentials.password,
        })
        .expect(401);

      expect(extractErrorMessage(response)).toContain('Invalid email or password');
    });

    it('should reject login with invalid password', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: userCredentials.email,
          password: 'wrongpassword',
        })
        .expect(401);

      expect(extractErrorMessage(response)).toContain('Invalid email or password');
    });

    it('should reject login with missing fields', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ email: userCredentials.email })
        .expect(400);

      expect(response.body).toHaveProperty('errors');
    });

    it('should handle case insensitive email login', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: userCredentials.email.toUpperCase(),
          password: userCredentials.password,
        })
        .expect(200);

      expect(response.body.user.email).toBe(userCredentials.email);
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('should return not implemented status', async () => {
      const response = await request(app)
        .post('/auth/forgot-password')
        .send({ email: 'test@example.com' })
        .expect(501);

      expect(response.body.message).toContain('not yet implemented');
    });
  });
}); 