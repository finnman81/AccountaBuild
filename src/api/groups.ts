import apiClient from './client';

export interface Group {
  id: string;
  name: string;
  description: string | null;
  adminId: string;
  createdAt: string;
  updatedAt: string;
}

export const getMyGroups = async (): Promise<Group[]> => {
  try {
    const response = await apiClient.get('/groups/my-groups');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch groups:', error);
    throw error;
  }
};

export const createGroup = async (name: string, description: string): Promise<Group> => {
  try {
    const response = await apiClient.post('/groups', { name, description });
    return response.data;
  } catch (error) {
    console.error('Failed to create group:', error);
    throw error;
  }
}; 