"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../lib/prisma");
const jwt_1 = require("../config/jwt");
const router = express_1.default.Router();
// Register endpoint
router.post('/register', async (req, res) => {
    try {
        const { email, username, password } = req.body;
        // Validation
        if (!email || !username || !password) {
            return res.status(400).json({
                error: 'Email, username, and password are required'
            });
        }
        if (password.length < 6) {
            return res.status(400).json({
                error: 'Password must be at least 6 characters long'
            });
        }
        // Check if user already exists
        const existingUser = await prisma_1.prisma.user.findFirst({
            where: {
                OR: [
                    { email: email.toLowerCase() },
                    { username: username.toLowerCase() }
                ]
            }
        });
        if (existingUser) {
            return res.status(409).json({
                error: 'User with this email or username already exists'
            });
        }
        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcryptjs_1.default.hash(password, saltRounds);
        // Create user
        const user = await prisma_1.prisma.user.create({
            data: {
                email: email.toLowerCase(),
                username: username.toLowerCase(),
                passwordHash
            },
            select: {
                id: true,
                email: true,
                username: true,
                avatar: true,
                createdAt: true
            }
        });
        // Generate JWT token
        const token = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email }, jwt_1.JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({
            message: 'User registered successfully',
            user,
            token
        });
    }
    catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Login endpoint
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        // Validation
        if (!email || !password) {
            return res.status(400).json({
                error: 'Email and password are required'
            });
        }
        // Find user by email
        const user = await prisma_1.prisma.user.findUnique({
            where: { email: email.toLowerCase() }
        });
        if (!user) {
            return res.status(401).json({
                error: 'Invalid email or password'
            });
        }
        // Verify password
        const isPasswordValid = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            return res.status(401).json({
                error: 'Invalid email or password'
            });
        }
        // Generate JWT token
        const token = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email }, jwt_1.JWT_SECRET, { expiresIn: '7d' });
        // Return user data (without password hash)
        const { passwordHash, ...userWithoutPassword } = user;
        res.json({
            message: 'Login successful',
            user: userWithoutPassword,
            token
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Password reset request endpoint (placeholder for future implementation)
router.post('/forgot-password', async (req, res) => {
    res.status(501).json({
        message: 'Password reset functionality not yet implemented'
    });
});
exports.default = router;
