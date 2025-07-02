import express from 'express';
import { protect } from '../middleware/auth';
import { getSignedUrlForUpload } from '../controllers/uploadController';

const router = express.Router();

// @route   POST /api/upload/signed-url
// @desc    Get a signed URL for file uploads
// @access  Private
router.post('/signed-url', protect, getSignedUrlForUpload);

export default router; 