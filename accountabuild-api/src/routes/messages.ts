import express, { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { protect } from '../middleware/auth';

const router = express.Router();

// ========== MESSAGE OPERATIONS ==========

// GET all messages for a specific group (paginated)
router.get('/:groupId', protect, async (req: Request, res: Response) => {
  const { groupId } = req.params;
  const userId = req.user?.id;

  // Pagination parameters
  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 50;
  const skip = (page - 1) * limit;

  try {
    // First, verify the user is a member of the group to authorize access
    const membership = await prisma.membership.findFirst({
      where: {
        groupId,
        userId,
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Forbidden: You are not a member of this group.' });
    }

    // Fetch the messages for the group
    const messages = await prisma.message.findMany({
      where: { groupId },
      include: {
        user: {
          select: { id: true, username: true, avatar: true }, // Include sender's public info
        },
      },
      orderBy: {
        createdAt: 'desc', // Most recent messages first
      },
      take: limit,
      skip,
    });
    
    // Also get the total count for pagination metadata
    const totalMessages = await prisma.message.count({ where: { groupId } });

    res.json({
        messages: messages.reverse(), // Reverse to show oldest first in the final payload
        totalPages: Math.ceil(totalMessages / limit),
        currentPage: page
    });
  } catch (error) {
    console.error(`Failed to fetch messages for group ${groupId}:`, error);
    res.status(500).json({ error: 'Internal server error while fetching messages.' });
  }
});

export default router; 