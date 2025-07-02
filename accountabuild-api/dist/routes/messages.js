"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// ========== MESSAGE OPERATIONS ==========
// GET all messages for a specific group (paginated)
router.get('/:groupId', auth_1.protect, async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user?.id;
    // Pagination parameters
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;
    try {
        // First, verify the user is a member of the group to authorize access
        const membership = await prisma_1.prisma.membership.findFirst({
            where: {
                groupId,
                userId,
            },
        });
        if (!membership) {
            return res.status(403).json({ error: 'Forbidden: You are not a member of this group.' });
        }
        // Fetch the messages for the group
        const messages = await prisma_1.prisma.message.findMany({
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
        const totalMessages = await prisma_1.prisma.message.count({ where: { groupId } });
        res.json({
            messages: messages.reverse(), // Reverse to show oldest first in the final payload
            totalPages: Math.ceil(totalMessages / limit),
            currentPage: page
        });
    }
    catch (error) {
        console.error(`Failed to fetch messages for group ${groupId}:`, error);
        res.status(500).json({ error: 'Internal server error while fetching messages.' });
    }
});
exports.default = router;
