import React, { createContext, useState, useEffect } from 'react';
import * as Keychain from 'react-native-keychain';
import { jwtDecode } from 'jwt-decode';
import apiClient from '../api/client';
import { initializeSocket, getSocket } from '../socket/socket';

interface User {
  id: string;
  email: string;
  username: string | null;
}

interface AuthContextData {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const setSession = async (sessionToken: string) => {
    const decodedUser: User = jwtDecode(sessionToken);
    setToken(sessionToken);
    setUser(decodedUser);
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${sessionToken}`;
    initializeSocket(sessionToken);
    await Keychain.setGenericPassword('token', sessionToken);
  };

  useEffect(() => {
    const loadToken = async () => {
      try {
        const credentials = await Keychain.getGenericPassword();
        if (credentials) {
          await setSession(credentials.password);
        }
      } catch (error) {
        console.error("Failed to load token from storage", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadToken();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await apiClient.post('/auth/login', { email, password });
      await setSession(response.data.token);
    } catch (error) {
      console.error("Login failed", error);
      throw error;
    }
  };

  const register = async (username: string, email: string, password: string) => {
    try {
      const response = await apiClient.post('/auth/register', { username, email, password });
      await setSession(response.data.token);
    } catch (error) {
      console.error("Registration failed", error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      const socket = getSocket();
      socket.disconnect();
    } catch (error) {
      console.log("Socket wasn't initialized, which is fine on logout.");
    }
    setToken(null);
    setUser(null);
    delete apiClient.defaults.headers.common['Authorization'];
    await Keychain.resetGenericPassword();
  };

  return (
    <AuthContext.Provider value={{ token, user, isAuthenticated: !!token, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}; 