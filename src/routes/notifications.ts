import express from 'express';
import { protect } from '../middleware/auth';
import { registerPushToken } from '../controllers/notificationController';

const router = express.Router();

// @route   POST /api/notifications/register
// @desc    Register a device token for push notifications
// @access  Private
router.post('/register', protect, registerPushToken);

export default router; 