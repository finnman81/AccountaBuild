"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.protect = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../lib/prisma");
const jwt_1 = require("../config/jwt");
const protect = async (req, res, next) => {
    let token;
    if (req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')) {
        try {
            // Get token from header
            token = req.headers.authorization.split(' ')[1];
            // Verify token
            const decoded = jsonwebtoken_1.default.verify(token, jwt_1.JWT_SECRET);
            // Get user from the token
            req.user = {
                id: decoded.userId,
                email: decoded.email
            };
            // Fetch the full user from DB to ensure they still exist (optional but good practice)
            const userExists = await prisma_1.prisma.user.findUnique({ where: { id: decoded.userId } });
            if (!userExists) {
                return res.status(401).json({ error: 'Not authorized, user not found' });
            }
            next();
        }
        catch (error) {
            console.error(error);
            return res.status(401).json({ error: 'Not authorized, token failed' });
        }
    }
    if (!token) {
        return res.status(401).json({ error: 'Not authorized, no token' });
    }
};
exports.protect = protect;
