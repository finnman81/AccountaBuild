"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// ========== CRUD OPERATIONS ==========
// 1. CREATE a new group
// The user who creates the group is automatically made an ADMIN.
router.post('/', auth_1.protect, async (req, res) => {
    const { name, description, avatar } = req.body;
    const userId = req.user?.id;
    if (!name || !userId) {
        return res.status(400).json({ error: 'Group name and user ID are required.' });
    }
    try {
        const newGroup = await prisma_1.prisma.group.create({
            data: {
                name,
                description,
                avatar,
                memberships: {
                    create: {
                        userId: userId,
                        role: 'ADMIN',
                    },
                },
            },
            include: {
                memberships: true, // Include the initial membership record
            },
        });
        res.status(201).json(newGroup);
    }
    catch (error) {
        console.error('Failed to create group:', error);
        res.status(500).json({ error: 'Internal server error while creating group.' });
    }
});
// 2. READ all groups (Public Listing)
router.get('/', auth_1.protect, async (req, res) => {
    try {
        const groups = await prisma_1.prisma.group.findMany({
            include: {
                _count: {
                    select: { memberships: true }, // Include the number of members
                },
            },
        });
        res.json(groups);
    }
    catch (error) {
        console.error('Failed to fetch groups:', error);
        res.status(500).json({ error: 'Internal server error while fetching groups.' });
    }
});
// 3. READ a single group by ID
router.get('/:id', auth_1.protect, async (req, res) => {
    const { id } = req.params;
    try {
        const group = await prisma_1.prisma.group.findUnique({
            where: { id },
            include: {
                memberships: {
                    include: {
                        user: {
                            select: { id: true, username: true, avatar: true }, // Select public user data
                        },
                    },
                },
            },
        });
        if (!group) {
            return res.status(404).json({ error: 'Group not found.' });
        }
        res.json(group);
    }
    catch (error) {
        console.error(`Failed to fetch group ${id}:`, error);
        res.status(500).json({ error: 'Internal server error while fetching group.' });
    }
});
// 4. UPDATE a group by ID (Admin only)
router.put('/:id', auth_1.protect, async (req, res) => {
    const { id } = req.params;
    const { name, description, avatar } = req.body;
    const userId = req.user?.id;
    try {
        // First, verify the user is an admin of the group
        const membership = await prisma_1.prisma.membership.findFirst({
            where: {
                groupId: id,
                userId: userId,
                role: 'ADMIN',
            },
        });
        if (!membership) {
            return res.status(403).json({ error: 'Forbidden: You do not have permission to update this group.' });
        }
        // If authorized, update the group
        const updatedGroup = await prisma_1.prisma.group.update({
            where: { id },
            data: {
                name,
                description,
                avatar,
            },
        });
        res.json(updatedGroup);
    }
    catch (error) {
        console.error(`Failed to update group ${id}:`, error);
        res.status(500).json({ error: 'Internal server error while updating group.' });
    }
});
// 5. DELETE a group by ID (Admin only)
router.delete('/:id', auth_1.protect, async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id;
    try {
        // First, verify the user is an admin of the group
        const membership = await prisma_1.prisma.membership.findFirst({
            where: {
                groupId: id,
                userId: userId,
                role: 'ADMIN',
            },
        });
        if (!membership) {
            return res.status(403).json({ error: 'Forbidden: You do not have permission to delete this group.' });
        }
        // Prisma will cascade delete related memberships and messages based on the schema
        await prisma_1.prisma.group.delete({
            where: { id },
        });
        res.status(204).send(); // No content
    }
    catch (error) {
        console.error(`Failed to delete group ${id}:`, error);
        res.status(500).json({ error: 'Internal server error while deleting group.' });
    }
});
// ========== MEMBERSHIP MANAGEMENT ==========
// JOIN a group
router.post('/:id/join', auth_1.protect, async (req, res) => {
    const { id: groupId } = req.params;
    const userId = req.user?.id;
    if (!userId) {
        return res.status(400).json({ error: 'User ID not found.' });
    }
    try {
        // Check if the group exists
        const group = await prisma_1.prisma.group.findUnique({ where: { id: groupId } });
        if (!group) {
            return res.status(404).json({ error: 'Group not found.' });
        }
        // Check if the user is already a member
        const existingMembership = await prisma_1.prisma.membership.findFirst({
            where: { groupId, userId },
        });
        if (existingMembership) {
            return res.status(409).json({ error: 'You are already a member of this group.' });
        }
        // Create the new membership
        const newMembership = await prisma_1.prisma.membership.create({
            data: {
                userId,
                groupId,
                role: 'MEMBER', // Default role for new members
            },
        });
        res.status(201).json(newMembership);
    }
    catch (error) {
        console.error(`Failed to join group ${groupId}:`, error);
        res.status(500).json({ error: 'Internal server error while joining group.' });
    }
});
// LEAVE a group
router.delete('/:id/leave', auth_1.protect, async (req, res) => {
    const { id: groupId } = req.params;
    const userId = req.user?.id;
    if (!userId) {
        return res.status(400).json({ error: 'User ID not found.' });
    }
    try {
        // Find the user's membership in the group
        const membership = await prisma_1.prisma.membership.findFirst({
            where: { groupId, userId },
        });
        if (!membership) {
            return res.status(404).json({ error: 'You are not a member of this group.' });
        }
        // Prevent the last admin from leaving the group
        if (membership.role === 'ADMIN') {
            const adminCount = await prisma_1.prisma.membership.count({
                where: { groupId, role: 'ADMIN' },
            });
            if (adminCount <= 1) {
                return res.status(400).json({
                    error: 'You are the last admin. Please promote another member or delete the group before leaving.',
                });
            }
        }
        // Delete the membership
        await prisma_1.prisma.membership.delete({
            where: { id: membership.id },
        });
        res.status(204).send(); // No content
    }
    catch (error) {
        console.error(`Failed to leave group ${groupId}:`, error);
        res.status(500).json({ error: 'Internal server error while leaving group.' });
    }
});
exports.default = router;
