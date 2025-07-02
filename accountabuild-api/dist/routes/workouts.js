"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// POST /workouts/sync - Endpoint to receive and process a batch of workout records
router.post('/sync', auth_1.protect, async (req, res) => {
    const workouts = req.body.workouts;
    const userId = req.user?.id;
    if (!userId) {
        return res.status(400).json({ error: 'User ID not found.' });
    }
    if (!Array.isArray(workouts) || workouts.length === 0) {
        return res.status(400).json({ error: 'Request body must contain a non-empty array of workouts.' });
    }
    const upsertedWorkouts = [];
    const errors = [];
    for (const workout of workouts) {
        // Basic validation for each workout object
        if (!workout.healthKitId || !workout.workoutType || !workout.duration || !workout.startTime || !workout.endTime) {
            errors.push({ workout, error: 'Missing required fields for workout record.' });
            continue;
        }
        try {
            const result = await prisma_1.prisma.workoutRecord.upsert({
                where: { healthKitId: workout.healthKitId },
                update: {
                    ...workout,
                    startTime: new Date(workout.startTime),
                    endTime: new Date(workout.endTime),
                    userId, // Ensure the user ID is set on update as well
                },
                create: {
                    ...workout,
                    startTime: new Date(workout.startTime),
                    endTime: new Date(workout.endTime),
                    userId,
                },
            });
            upsertedWorkouts.push(result);
        }
        catch (error) {
            // Check for Prisma-specific error for invalid enum value
            if (error.code === 'P2007' || (error.message && error.message.includes('enum'))) {
                errors.push({ workout, error: `Invalid workout type: ${workout.workoutType}` });
            }
            else {
                console.error(`Failed to upsert workout with healthKitId ${workout.healthKitId}:`, error);
                errors.push({ healthKitId: workout.healthKitId, error: 'Failed to save workout record.' });
            }
        }
    }
    res.status(200).json({
        message: 'Workout sync process completed.',
        syncedCount: upsertedWorkouts.length,
        failedCount: errors.length,
        errors,
    });
});
// GET /workouts - Endpoint to fetch all workout records for the authenticated user
router.get('/', auth_1.protect, async (req, res) => {
    const userId = req.user?.id;
    try {
        const workoutRecords = await prisma_1.prisma.workoutRecord.findMany({
            where: { userId },
            orderBy: { startTime: 'desc' },
        });
        res.json(workoutRecords);
    }
    catch (error) {
        console.error('Failed to fetch workout records:', error);
        res.status(500).json({ error: 'Internal server error while fetching workout records.' });
    }
});
exports.default = router;
