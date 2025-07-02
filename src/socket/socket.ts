import { io, Socket } from 'socket.io-client';

const URL = 'http://10.0.2.2:5001'; // The base URL of our backend server

let socket: Socket;

export const getSocket = (): Socket => {
  if (!socket) {
    throw new Error("Socket.io has not been initialized. Please call initializeSocket first.");
  }
  return socket;
};

export const initializeSocket = (token: string): Socket => {
  if (socket) {
    return socket;
  }
  
  socket = io(URL, {
    autoConnect: false, // We will connect manually
    auth: {
      token,
    },
  });

  // Optional: Add logging for connection events for debugging
  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('Socket connection error:', err.message);
  });

  return socket;
}; 