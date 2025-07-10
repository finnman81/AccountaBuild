import React from 'react';
import { render, act } from '@testing-library/react-native';
import { AuthProvider, AuthContext } from '../../src/store/AuthContext';
import { Text } from 'react-native';

// Mock axios
jest.mock('axios');
const mockAxios = require('axios');

// Mock keychain
const mockKeychain = require('react-native-keychain');

// Test component that uses AuthContext
const TestComponent = () => {
  const auth = React.useContext(AuthContext);
  
  return (
    <Text testID="auth-state">
      {JSON.stringify({
        isLoggedIn: !!auth.user,
        isLoading: auth.isLoading,
        userEmail: auth.user?.email || null,
      })}
    </Text>
  );
};

const renderWithAuthProvider = () => {
  return render(
    <AuthProvider>
      <TestComponent />
    </AuthProvider>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset axios mock
    mockAxios.post.mockReset();
    mockAxios.defaults = { baseURL: '' };
  });

  it('provides initial auth state', () => {
    const { getByTestId } = renderWithAuthProvider();
    const authState = JSON.parse(getByTestId('auth-state').props.children);
    
    expect(authState).toEqual({
      isLoggedIn: false,
      isLoading: false,
      userEmail: null,
    });
  });

  it('handles successful login', async () => {
    const mockResponse = {
      data: {
        user: { id: '1', email: 'test@example.com', username: 'testuser' },
        token: 'mock-jwt-token',
      },
    };
    
    mockAxios.post.mockResolvedValue(mockResponse);
    mockKeychain.setInternetCredentials.mockResolvedValue(true);
    
    const { getByTestId } = renderWithAuthProvider();
    const authContext = React.useContext(AuthContext);
    
    await act(async () => {
      await authContext.login('test@example.com', 'password123');
    });
    
    const authState = JSON.parse(getByTestId('auth-state').props.children);
    expect(authState.isLoggedIn).toBe(true);
    expect(authState.userEmail).toBe('test@example.com');
    
    expect(mockAxios.post).toHaveBeenCalledWith('/auth/login', {
      email: 'test@example.com',
      password: 'password123',
    });
    
    expect(mockKeychain.setInternetCredentials).toHaveBeenCalledWith(
      'accountabuild',
      'test@example.com',
      'mock-jwt-token'
    );
  });

  it('handles login failure', async () => {
    mockAxios.post.mockRejectedValue(new Error('Invalid credentials'));
    
    const { getByTestId } = renderWithAuthProvider();
    const authContext = React.useContext(AuthContext);
    
    await expect(
      act(async () => {
        await authContext.login('test@example.com', 'wrongpassword');
      })
    ).rejects.toThrow('Invalid credentials');
    
    const authState = JSON.parse(getByTestId('auth-state').props.children);
    expect(authState.isLoggedIn).toBe(false);
  });

  it('handles successful registration', async () => {
    const mockResponse = {
      data: {
        user: { id: '1', email: 'test@example.com', username: 'testuser' },
        token: 'mock-jwt-token',
      },
    };
    
    mockAxios.post.mockResolvedValue(mockResponse);
    mockKeychain.setInternetCredentials.mockResolvedValue(true);
    
    const { getByTestId } = renderWithAuthProvider();
    const authContext = React.useContext(AuthContext);
    
    await act(async () => {
      await authContext.register('test@example.com', 'testuser', 'password123');
    });
    
    const authState = JSON.parse(getByTestId('auth-state').props.children);
    expect(authState.isLoggedIn).toBe(true);
    expect(authState.userEmail).toBe('test@example.com');
    
    expect(mockAxios.post).toHaveBeenCalledWith('/auth/register', {
      email: 'test@example.com',
      username: 'testuser',
      password: 'password123',
    });
  });

  it('handles logout', async () => {
    // First login
    const mockResponse = {
      data: {
        user: { id: '1', email: 'test@example.com', username: 'testuser' },
        token: 'mock-jwt-token',
      },
    };
    
    mockAxios.post.mockResolvedValue(mockResponse);
    mockKeychain.setInternetCredentials.mockResolvedValue(true);
    mockKeychain.resetInternetCredentials.mockResolvedValue(true);
    
    const { getByTestId } = renderWithAuthProvider();
    const authContext = React.useContext(AuthContext);
    
    // Login first
    await act(async () => {
      await authContext.login('test@example.com', 'password123');
    });
    
    // Then logout
    await act(async () => {
      await authContext.logout();
    });
    
    const authState = JSON.parse(getByTestId('auth-state').props.children);
    expect(authState.isLoggedIn).toBe(false);
    expect(authState.userEmail).toBe(null);
    
    expect(mockKeychain.resetInternetCredentials).toHaveBeenCalledWith('accountabuild');
  });

  it('restores auth state on app start', async () => {
    mockKeychain.getInternetCredentials.mockResolvedValue({
      username: 'test@example.com',
      password: 'mock-jwt-token',
    });
    
    // Mock token validation
    mockAxios.get = jest.fn().mockResolvedValue({
      data: { user: { id: '1', email: 'test@example.com', username: 'testuser' } },
    });
    
    const { getByTestId } = renderWithAuthProvider();
    
    await act(async () => {
      // Wait for the auth restoration to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    const authState = JSON.parse(getByTestId('auth-state').props.children);
    expect(authState.isLoggedIn).toBe(true);
    expect(authState.userEmail).toBe('test@example.com');
  });
}); 