import React from 'react';
import { render } from '@testing-library/react-native';
import { Text, View } from 'react-native';

// Simple component for testing
const TestComponent = ({ message }: { message: string }) => (
  <View>
    <Text testID="test-message">{message}</Text>
  </View>
);

describe('Simple Test Setup', () => {
  it('should render a simple component', () => {
    const { getByTestId } = render(
      <TestComponent message="Hello Testing!" />
    );
    
    const messageElement = getByTestId('test-message');
    expect(messageElement).toBeTruthy();
    expect(messageElement.props.children).toBe('Hello Testing!');
  });

  it('should handle basic assertions', () => {
    const testData = { name: 'AccountaBuild', version: '1.0' };
    
    expect(testData.name).toBe('AccountaBuild');
    expect(testData.version).toBe('1.0');
    expect(typeof testData.name).toBe('string');
  });

  it('should test async operations', async () => {
    const asyncFunction = async () => {
      return new Promise(resolve => {
        setTimeout(() => resolve('async result'), 10);
      });
    };

    const result = await asyncFunction();
    expect(result).toBe('async result');
  });
}); 