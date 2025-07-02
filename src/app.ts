import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import http from 'http';
import { corsOptions } from './config/corsOptions';
import authRoutes from './routes/auth';
import groupRoutes from './routes/groups';
import messageRoutes from './routes/messages';
import goalRoutes from './routes/goals';
import healthRoutes from './routes/health';
import uploadRoutes from './routes/upload';
import notificationRoutes from './routes/notifications';
import { errorHandler } from './middleware/error';
import { protect } from './middleware/auth';
import { initializeSocketIO } from './config/socket';

const app = express();

app.use(cors(corsOptions));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions,
});

initializeSocketIO(io);

app.get('/', (req, res) => {
  res.send('API is running...');
});

app.use('/api/auth', authRoutes);
app.use('/api/groups', protect, groupRoutes);
app.use('/api/messages', protect, messageRoutes);
app.use('/api/goals', protect, goalRoutes);
app.use('/api/health', protect, healthRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/notifications', protect, notificationRoutes);

app.use(errorHandler);

export { server, io }; 