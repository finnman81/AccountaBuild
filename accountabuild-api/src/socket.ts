import { Server, Socket } from 'socket.io';
import { prisma } from './lib/prisma';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './config/jwt';

// Define the shape of the decoded token
interface DecodedToken {
  userId: string;
  email: string;
}

// Store a mapping of socket IDs to user IDs
const socketUserMap = new Map<string, string>();

export const initSocketServer = (io: Server) => {
  // Middleware for Socket.io authentication
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error: Token not provided.'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
      socketUserMap.set(socket.id, decoded.userId);
      next();
    } catch (err) {
      return next(new Error('Authentication error: Invalid token.'));
    }
  });

  io.on('connection', (socket: Socket) => {
    console.log(`Socket connected: ${socket.id}`);
    const userId = socketUserMap.get(socket.id);
    if (!userId) {
      console.log(`User ID for socket ${socket.id} not found.`);
      return;
    }

    // ========== EVENT LISTENERS ==========

    // Join a group's chat room
    socket.on('joinGroup', (groupId: string) => {
      socket.join(groupId);
      console.log(`User ${userId} joined group room: ${groupId}`);
    });

    // Leave a group's chat room
    socket.on('leaveGroup', (groupId: string) => {
      socket.leave(groupId);
      console.log(`User ${userId} left group room: ${groupId}`);
    });

    // Listen for a new message from a client
    socket.on('sendMessage', async (data: { groupId: string; content: string }) => {
      const { groupId, content } = data;

      try {
        // Save the message to the database
        const message = await prisma.message.create({
          data: {
            content,
            groupId,
            userId,
          },
          include: {
            user: {
              select: { id: true, username: true, avatar: true },
            },
          },
        });

        // Broadcast the new message to everyone in the group room
        io.to(groupId).emit('newMessage', message);
      } catch (error) {
        console.error('Error saving or broadcasting message:', error);
        // Optionally, emit an error back to the sender
        socket.emit('messageError', { error: 'Failed to send message.' });
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
      socketUserMap.delete(socket.id);
    });
  });
}; 