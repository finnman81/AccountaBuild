import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import LoginScreen from '../../src/screens/LoginScreen';
import { AuthContext } from '../../src/store/AuthContext';

// Mock Alert
jest.spyOn(Alert, 'alert');

// Mock navigation
const mockNavigate = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
};

// Mock auth context
const mockAuthContext = {
  user: null,
  login: jest.fn(),
  logout: jest.fn(),
  register: jest.fn(),
  isLoading: false,
};

const renderWithAuth = (authValue = mockAuthContext) => {
  return render(
    <AuthContext.Provider value={authValue}>
      <LoginScreen navigation={mockNavigation} />
    </AuthContext.Provider>
  );
};

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders login form correctly', () => {
    const { getByText, getByDisplayValue } = renderWithAuth();
    
    expect(getByText('Welcome Back!')).toBeTruthy();
    expect(getByText('Login')).toBeTruthy();
    expect(getByText("Don't have an account? Register")).toBeTruthy();
  });

  it('handles email input changes', () => {
    const { getByDisplayValue } = renderWithAuth();
    const emailInput = getByDisplayValue('');
    
    fireEvent.changeText(emailInput, 'test@example.com');
    expect(emailInput.props.value).toBe('test@example.com');
  });

  it('handles password input changes', () => {
    const { getAllByDisplayValue } = renderWithAuth();
    const inputs = getAllByDisplayValue('');
    const passwordInput = inputs[1]; // Second input is password
    
    fireEvent.changeText(passwordInput, 'password123');
    expect(passwordInput.props.value).toBe('password123');
  });

  it('shows alert when trying to login with empty fields', () => {
    const { getByText } = renderWithAuth();
    const loginButton = getByText('Login');
    
    fireEvent.press(loginButton);
    
    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'Please enter both email and password.'
    );
  });

  it('calls auth.login with correct credentials', async () => {
    const { getByDisplayValue, getByText } = renderWithAuth();
    const emailInput = getByDisplayValue('')[0];
    const passwordInput = getByDisplayValue('')[1];
    const loginButton = getByText('Login');
    
    // Enter credentials
    fireEvent.changeText(emailInput, 'test@example.com');
    fireEvent.changeText(passwordInput, 'password123');
    
    // Press login
    fireEvent.press(loginButton);
    
    await waitFor(() => {
      expect(mockAuthContext.login).toHaveBeenCalledWith('test@example.com', 'password123');
    });
  });

  it('handles login failure', async () => {
    const failingAuthContext = {
      ...mockAuthContext,
      login: jest.fn().mockRejectedValue(new Error('Invalid credentials')),
    };
    
    const { getByDisplayValue, getByText } = renderWithAuth(failingAuthContext);
    const emailInput = getByDisplayValue('')[0];
    const passwordInput = getByDisplayValue('')[1];
    const loginButton = getByText('Login');
    
    // Enter credentials
    fireEvent.changeText(emailInput, 'test@example.com');
    fireEvent.changeText(passwordInput, 'password123');
    
    // Press login
    fireEvent.press(loginButton);
    
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Login Failed',
        'Invalid email or password.'
      );
    });
  });

  it('navigates to register screen', () => {
    const { getByText } = renderWithAuth();
    const registerButton = getByText("Don't have an account? Register");
    
    fireEvent.press(registerButton);
    
    expect(mockNavigate).toHaveBeenCalledWith('Register');
  });

  it('disables inputs and shows loading state during login', async () => {
    const loadingAuthContext = {
      ...mockAuthContext,
      login: jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100))),
    };
    
    const { getByDisplayValue, getByText } = renderWithAuth(loadingAuthContext);
    const emailInput = getByDisplayValue('')[0];
    const passwordInput = getByDisplayValue('')[1];
    const loginButton = getByText('Login');
    
    // Enter credentials
    fireEvent.changeText(emailInput, 'test@example.com');
    fireEvent.changeText(passwordInput, 'password123');
    
    // Press login
    fireEvent.press(loginButton);
    
    // Check loading state
    expect(emailInput.props.disabled).toBe(true);
    expect(passwordInput.props.disabled).toBe(true);
  });
}); 