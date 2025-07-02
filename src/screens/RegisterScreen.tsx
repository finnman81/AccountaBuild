import React, { useState, useContext } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { TextInput, Button, Text } from 'react-native-paper';
import { AuthContext } from '../store/AuthContext';
import { RegisterScreenProps } from '../navigation/types';

const RegisterScreen = ({ navigation }: RegisterScreenProps) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const auth = useContext(AuthContext);

  const handleRegister = async () => {
    if (!username || !email || !password) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }
    setIsLoading(true);
    try {
      await auth.register(username, email, password);
      // Navigation to home screen will be handled by the AppNavigator
    } catch (error) {
      Alert.alert('Registration Failed', 'Could not create account. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Account</Text>
      <TextInput
        label="Username"
        value={username}
        onChangeText={setUsername}
        style={styles.input}
        autoCapitalize="none"
        disabled={isLoading}
      />
      <TextInput
        label="Email"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        keyboardType="email-address"
        autoCapitalize="none"
        disabled={isLoading}
      />
      <TextInput
        label="Password"
        value={password}
        onChangeText={setPassword}
        style={styles.input}
        secureTextEntry
        disabled={isLoading}
      />
      <Button 
        mode="contained" 
        onPress={handleRegister} 
        style={styles.button}
        loading={isLoading}
        disabled={isLoading}
      >
        Register
      </Button>
      <Button 
        onPress={() => navigation.navigate('Login')} 
        style={styles.button}
        disabled={isLoading}
      >
        Already have an account? Login
      </Button>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  input: {
    marginBottom: 10,
  },
  button: {
    marginTop: 10,
  },
});

export default RegisterScreen; 