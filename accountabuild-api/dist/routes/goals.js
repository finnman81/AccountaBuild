"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// ========== GOAL CRUD OPERATIONS ==========
// 1. CREATE a new goal for the authenticated user
router.post('/', auth_1.protect, async (req, res) => {
    const { title, description, target, period } = req.body;
    const userId = req.user?.id;
    if (!userId || !title || !target || !period) {
        return res.status(400).json({ error: 'User ID, title, target, and period are required.' });
    }
    try {
        const newGoal = await prisma_1.prisma.goal.create({
            data: {
                userId,
                title,
                description,
                target: parseInt(target, 10),
                period, // Prisma client should validate the enum value
            },
        });
        res.status(201).json(newGoal);
    }
    catch (error) {
        // Check for Prisma-specific error for invalid enum value
        if (error.code === 'P2007' || (error.message && error.message.includes('enum'))) {
            return res.status(400).json({ error: 'Invalid goal period specified.' });
        }
        console.error('Failed to create goal:', error);
        res.status(500).json({ error: 'Internal server error while creating goal.' });
    }
});
// 2. READ all goals for the authenticated user
router.get('/', auth_1.protect, async (req, res) => {
    const userId = req.user?.id;
    try {
        const goals = await prisma_1.prisma.goal.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });
        res.json(goals);
    }
    catch (error) {
        console.error('Failed to fetch goals:', error);
        res.status(500).json({ error: 'Internal server error while fetching goals.' });
    }
});
// 3. READ a single goal by ID
router.get('/:id', auth_1.protect, async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id;
    try {
        const goal = await prisma_1.prisma.goal.findFirst({
            where: { id, userId }
        });
        if (!goal) {
            return res.status(404).json({ error: 'Goal not found or you do not have permission to view it.' });
        }
        res.json(goal);
    }
    catch (error) {
        console.error(`Failed to fetch goal ${id}:`, error);
        res.status(500).json({ error: 'Internal server error while fetching goal.' });
    }
});
// 4. UPDATE a goal by ID
router.put('/:id', auth_1.protect, async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id;
    const { title, description, target, period, current, isActive } = req.body;
    try {
        // First, ensure the goal exists and belongs to the user
        const existingGoal = await prisma_1.prisma.goal.findFirst({
            where: { id, userId },
        });
        if (!existingGoal) {
            return res.status(404).json({ error: 'Goal not found or you do not have permission to update it.' });
        }
        const updatedGoal = await prisma_1.prisma.goal.update({
            where: { id },
            data: {
                title,
                description,
                target: target ? parseInt(target, 10) : undefined,
                current: current ? parseInt(current, 10) : undefined,
                period,
                isActive,
            },
        });
        res.json(updatedGoal);
    }
    catch (error) {
        if (error.code === 'P2007' || (error.message && error.message.includes('enum'))) {
            return res.status(400).json({ error: 'Invalid goal period specified.' });
        }
        console.error(`Failed to update goal ${id}:`, error);
        res.status(500).json({ error: 'Internal server error while updating goal.' });
    }
});
// 5. DELETE a goal by ID
router.delete('/:id', auth_1.protect, async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id;
    try {
        // First, ensure the goal exists and belongs to the user
        const existingGoal = await prisma_1.prisma.goal.findFirst({
            where: { id, userId },
        });
        if (!existingGoal) {
            return res.status(404).json({ error: 'Goal not found or you do not have permission to delete it.' });
        }
        await prisma_1.prisma.goal.delete({
            where: { id },
        });
        res.status(204).send();
    }
    catch (error) {
        console.error(`Failed to delete goal ${id}:`, error);
        res.status(500).json({ error: 'Internal server error while deleting goal.' });
    }
});
exports.default = router;
