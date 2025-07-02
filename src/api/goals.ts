import apiClient from './client';

export interface Goal {
  id: string;
  description: string;
  target: number;
  progress: number;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
  userId: string;
}

export const getGoals = async (): Promise<Goal[]> => {
  try {
    const response = await apiClient.get('/goals');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch goals:', error);
    throw error;
  }
};

export const createGoal = async (description: string, target: number): Promise<Goal> => {
  try {
    const response = await apiClient.post('/goals', { description, target });
    return response.data;
  } catch (error) {
    console.error('Failed to create goal:', error);
    throw error;
  }
};

export const updateGoal = async (id: string, data: { progress?: number; isCompleted?: boolean }): Promise<Goal> => {
  try {
    const response = await apiClient.put(`/goals/${id}`, data);
    return response.data;
  } catch (error) {
    console.error(`Failed to update goal ${id}:`, error);
    throw error;
  }
};

export const deleteGoal = async (id: string): Promise<void> => {
  try {
    await apiClient.delete(`/goals/${id}`);
  } catch (error) {
    console.error(`Failed to delete goal ${id}:`, error);
    throw error;
  }
}; 