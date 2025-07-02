"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
// In development, we reuse the same PrismaClient instance across hot reloads
// to avoid creating too many connections. In production, a new instance is created once.
exports.prisma = global.prisma || new client_1.PrismaClient();
if (process.env.NODE_ENV !== 'production') {
    global.prisma = exports.prisma;
}
