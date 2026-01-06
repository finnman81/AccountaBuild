import React, { useContext, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Button, Card, Text, TextInput } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { AuthContext } from '../store/AuthContext';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { login } = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      console.log('Login error:', err?.code, err?.message);
      switch (err?.code) {
        case 'auth/invalid-email':
          setError('That email address looks invalid.');
          break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          setError('Login failed. Check your email/password.');
          break;
        case 'auth/operation-not-allowed':
          setError('Email/Password auth is not enabled in Firebase Console.');
          break;
        case 'auth/invalid-api-key':
        case 'auth/invalid-app-credential':
        case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
          setError('Firebase config looks invalid. Double-check your .env values (no quotes).');
          break;
        default:
          setError('Login failed. Check the terminal logs for the Firebase error code.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
        <Card>
          <Card.Title title="AccountaBuild" subtitle="Log in to continue" />
          <Card.Content>
            <TextInput
              label="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              disabled={isSubmitting}
            />
            <View style={{ height: 12 }} />
            <TextInput
              label="Password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              disabled={isSubmitting}
            />
            {error ? (
              <>
                <View style={{ height: 12 }} />
                <Text style={{ color: 'crimson' }}>{error}</Text>
              </>
            ) : null}
            <View style={{ height: 16 }} />
            <Button mode="contained" onPress={onSubmit} loading={isSubmitting} disabled={isSubmitting}>
              Log In
            </Button>
            <View style={{ height: 12 }} />
            <Button onPress={() => navigation.navigate('ForgotPassword')} disabled={isSubmitting}>
              Forgot password?
            </Button>
            <Button onPress={() => navigation.navigate('Register')} disabled={isSubmitting}>
              Create an account
            </Button>
          </Card.Content>
        </Card>
      </View>
    </KeyboardAvoidingView>
  );
}


