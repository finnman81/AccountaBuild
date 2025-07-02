import { Request, Response } from 'express';
import { registerDeviceWithSNS } from '../services/notificationService';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
  };
}

export const registerPushToken = async (req: AuthenticatedRequest, res: Response) => {
  const { deviceToken, deviceType } = req.body;
  const userId = req.user?.id;

  if (!deviceToken || !deviceType) {
    return res.status(400).json({ message: 'deviceToken and deviceType are required' });
  }

  if (!userId) {
    return res.status(401).json({ message: 'Not authorized' });
  }

  try {
    const pushToken = await registerDeviceWithSNS(userId, deviceToken, deviceType);
    res.status(201).json({ message: 'Device registered for push notifications successfully', pushToken });
  } catch (error) {
    console.error('Error registering device for push notifications:', error);
    res.status(500).json({ message: 'Server error during push notification registration' });
  }
}; 