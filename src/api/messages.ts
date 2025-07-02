import apiClient from './client';

export interface Message {
  id: string;
  content: string;
  createdAt: string;
  userId: string;
  groupId: string;
  user: {
    id: string;
    username: string | null;
  };
}

export const getMessages = async (groupId: string, page: number): Promise<Message[]> => {
  try {
    const response = await apiClient.get(`/messages/${groupId}?page=${page}`);
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch messages for group ${groupId}:`, error);
    throw error;
  }
}; 