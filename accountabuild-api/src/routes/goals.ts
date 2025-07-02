import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { protect } from '../middleware/auth';

const router = express.Router();

// ========== GOAL CRUD OPERATIONS ==========

// 1. CREATE a new goal for the authenticated user
router.post('/', protect, async (req: Request, res: Response) => {
  const { title, description, target, period } = req.body;
  const userId = req.user?.id;

  if (!userId || !title || !target || !period) {
    return res.status(400).json({ error: 'User ID, title, target, and period are required.' });
  }

  try {
    const newGoal = await prisma.goal.create({
      data: {
        userId,
        title,
        description,
        target: parseInt(target, 10),
        period, // Prisma client should validate the enum value
      },
    });
    res.status(201).json(newGoal);
  } catch (error: any) {
    // Check for Prisma-specific error for invalid enum value
    if (error.code === 'P2007' || (error.message && error.message.includes('enum'))) {
        return res.status(400).json({ error: 'Invalid goal period specified.' });
    }
    console.error('Failed to create goal:', error);
    res.status(500).json({ error: 'Internal server error while creating goal.' });
  }
});

// 2. READ all goals for the authenticated user
router.get('/', protect, async (req: Request, res: Response) => {
  const userId = req.user?.id;

  try {
    const goals = await prisma.goal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(goals);
  } catch (error) {
    console.error('Failed to fetch goals:', error);
    res.status(500).json({ error: 'Internal server error while fetching goals.' });
  }
});

// 3. READ a single goal by ID
router.get('/:id', protect, async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user?.id;

    try {
        const goal = await prisma.goal.findFirst({
            where: { id, userId }
        });

        if (!goal) {
            return res.status(404).json({ error: 'Goal not found or you do not have permission to view it.' });
        }
        res.json(goal);
    } catch (error) {
        console.error(`Failed to fetch goal ${id}:`, error);
        res.status(500).json({ error: 'Internal server error while fetching goal.' });
    }
});

// 4. UPDATE a goal by ID
router.put('/:id', protect, async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const { title, description, target, period, current, isActive } = req.body;

  try {
    // First, ensure the goal exists and belongs to the user
    const existingGoal = await prisma.goal.findFirst({
      where: { id, userId },
    });

    if (!existingGoal) {
      return res.status(404).json({ error: 'Goal not found or you do not have permission to update it.' });
    }
    
    const updatedGoal = await prisma.goal.update({
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
  } catch (error: any) {
    if (error.code === 'P2007' || (error.message && error.message.includes('enum'))) {
        return res.status(400).json({ error: 'Invalid goal period specified.' });
    }
    console.error(`Failed to update goal ${id}:`, error);
    res.status(500).json({ error: 'Internal server error while updating goal.' });
  }
});

// 5. DELETE a goal by ID
router.delete('/:id', protect, async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
     // First, ensure the goal exists and belongs to the user
     const existingGoal = await prisma.goal.findFirst({
        where: { id, userId },
      });
  
      if (!existingGoal) {
        return res.status(404).json({ error: 'Goal not found or you do not have permission to delete it.' });
      }

    await prisma.goal.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    console.error(`Failed to delete goal ${id}:`, error);
    res.status(500).json({ error: 'Internal server error while deleting goal.' });
  }
});

export default router; 