import request from 'supertest';
import express from 'express';
import groupsRouter from '../../src/routes/groups';
import { protect } from '../../src/middleware/auth';
import { testPrisma } from '../setup';
import { createAuthenticatedUser, createTestGroup, extractErrorMessage } from '../helpers/testUtils';

// Create test app
const app = express();
app.use(express.json());
app.use('/groups', protect, groupsRouter);

describe('Groups Routes', () => {
  let authUser: any;
  let authToken: string;

  beforeEach(async () => {
    const auth = await createAuthenticatedUser();
    authUser = auth.user;
    authToken = auth.token;
  });

  describe('POST /groups', () => {
    const validGroupData = {
      name: 'Test Fitness Group',
      description: 'A group for testing fitness goals',
    };

    it('should create a new group successfully', async () => {
      const response = await request(app)
        .post('/groups')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validGroupData)
        .expect(201);

      expect(response.body).toHaveProperty('message', 'Group created successfully');
      expect(response.body).toHaveProperty('group');
      expect(response.body.group.name).toBe(validGroupData.name);
      expect(response.body.group.description).toBe(validGroupData.description);

      // Verify user is automatically added as admin
      const membership = await testPrisma.membership.findFirst({
        where: { 
          userId: authUser.id, 
          groupId: response.body.group.id 
        }
      });
      expect(membership).toBeTruthy();
      expect(membership?.role).toBe('ADMIN');
    });

    it('should reject group creation without authentication', async () => {
      const response = await request(app)
        .post('/groups')
        .send(validGroupData)
        .expect(401);

      expect(extractErrorMessage(response)).toContain('token');
    });

    it('should reject group creation with missing name', async () => {
      const response = await request(app)
        .post('/groups')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ description: 'Group without name' })
        .expect(400);

      expect(response.body).toHaveProperty('errors');
    });

    it('should create group with minimal data (name only)', async () => {
      const response = await request(app)
        .post('/groups')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Minimal Group' })
        .expect(201);

      expect(response.body.group.name).toBe('Minimal Group');
      expect(response.body.group.description).toBeNull();
    });
  });

  describe('GET /groups', () => {
    beforeEach(async () => {
      // Create test groups with memberships
      const group1 = await createTestGroup({ name: 'Group 1' });
      const group2 = await createTestGroup({ name: 'Group 2' });
      
      await testPrisma.membership.create({
        data: { userId: authUser.id, groupId: group1.id, role: 'ADMIN' }
      });
      await testPrisma.membership.create({
        data: { userId: authUser.id, groupId: group2.id, role: 'MEMBER' }
      });
    });

    it('should return user groups successfully', async () => {
      const response = await request(app)
        .get('/groups')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('groups');
      expect(Array.isArray(response.body.groups)).toBe(true);
      expect(response.body.groups).toHaveLength(2);
      
      // Check if groups include membership info
      const group = response.body.groups[0];
      expect(group).toHaveProperty('memberships');
      expect(Array.isArray(group.memberships)).toBe(true);
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get('/groups')
        .expect(401);

      expect(extractErrorMessage(response)).toContain('token');
    });
  });

  describe('POST /groups/:groupId/join', () => {
    let testGroup: any;

    beforeEach(async () => {
      testGroup = await createTestGroup({ name: 'Joinable Group' });
    });

    it('should join group successfully', async () => {
      const response = await request(app)
        .post(`/groups/${testGroup.id}/join`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Joined group successfully');
      expect(response.body).toHaveProperty('membership');
      expect(response.body.membership.role).toBe('MEMBER');

      // Verify membership in database
      const membership = await testPrisma.membership.findFirst({
        where: { userId: authUser.id, groupId: testGroup.id }
      });
      expect(membership).toBeTruthy();
    });

    it('should reject joining non-existent group', async () => {
      const response = await request(app)
        .post('/groups/nonexistent/join')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(extractErrorMessage(response)).toContain('not found');
    });

    it('should reject joining already joined group', async () => {
      // First join
      await request(app)
        .post(`/groups/${testGroup.id}/join`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Try to join again
      const response = await request(app)
        .post(`/groups/${testGroup.id}/join`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(409);

      expect(extractErrorMessage(response)).toContain('already a member');
    });
  });

  describe('POST /groups/:groupId/leave', () => {
    let testGroup: any;

    beforeEach(async () => {
      testGroup = await createTestGroup({ name: 'Leavable Group' });
      await testPrisma.membership.create({
        data: { userId: authUser.id, groupId: testGroup.id, role: 'MEMBER' }
      });
    });

    it('should leave group successfully', async () => {
      const response = await request(app)
        .post(`/groups/${testGroup.id}/leave`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Left group successfully');

      // Verify membership removed from database
      const membership = await testPrisma.membership.findFirst({
        where: { userId: authUser.id, groupId: testGroup.id }
      });
      expect(membership).toBeNull();
    });

    it('should reject leaving non-joined group', async () => {
      const otherGroup = await createTestGroup({ name: 'Other Group' });

      const response = await request(app)
        .post(`/groups/${otherGroup.id}/leave`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(extractErrorMessage(response)).toContain('not a member');
    });
  });

  describe('GET /groups/:groupId/members', () => {
    let testGroup: any;
    let otherUser: any;

    beforeEach(async () => {
      testGroup = await createTestGroup({ name: 'Members Group' });
      const otherAuth = await createAuthenticatedUser();
      otherUser = otherAuth.user;

      // Add both users to group
      await testPrisma.membership.createMany({
        data: [
          { userId: authUser.id, groupId: testGroup.id, role: 'ADMIN' },
          { userId: otherUser.id, groupId: testGroup.id, role: 'MEMBER' },
        ]
      });
    });

    it('should return group members successfully', async () => {
      const response = await request(app)
        .get(`/groups/${testGroup.id}/members`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('members');
      expect(Array.isArray(response.body.members)).toBe(true);
      expect(response.body.members).toHaveLength(2);

      const adminMember = response.body.members.find((m: any) => m.role === 'ADMIN');
      const regularMember = response.body.members.find((m: any) => m.role === 'MEMBER');
      
      expect(adminMember.user.id).toBe(authUser.id);
      expect(regularMember.user.id).toBe(otherUser.id);
    });

    it('should reject non-member access', async () => {
      const nonMemberAuth = await createAuthenticatedUser();

      const response = await request(app)
        .get(`/groups/${testGroup.id}/members`)
        .set('Authorization', `Bearer ${nonMemberAuth.token}`)
        .expect(403);

      expect(extractErrorMessage(response)).toContain('not a member');
    });
  });
}); 