import React, { useContext, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Button, Card, Text, TextInput } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/types';
import { AuthContext } from '../store/AuthContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

export default function RegisterScreen({ navigation }: Props) {
  const { register } = useContext(AuthContext);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      if (!displayName.trim()) {
        setError('Please enter a display name.');
        return;
      }
      await register(displayName, email, password);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      console.log('Register error:', err?.code, err?.message);
      switch (err?.code) {
        case 'auth/operation-not-allowed':
          setError('Email/Password auth is not enabled in Firebase Console.');
          break;
        case 'auth/email-already-in-use':
          setError('That email is already in use. Try logging in instead.');
          break;
        case 'auth/invalid-email':
          setError('That email address looks invalid.');
          break;
        case 'auth/weak-password':
          setError('Password is too weak (must be at least 6 characters).');
          break;
        case 'auth/invalid-api-key':
        case 'auth/invalid-app-credential':
        case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
          setError('Firebase config looks invalid. Double-check your .env values (no quotes).');
          break;
        default:
          setError('Registration failed. Check the terminal logs for the Firebase error code.');
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
          <Card.Title title="Create your account" />
          <Card.Content>
            <TextInput
              label="Display name"
              value={displayName}
              onChangeText={setDisplayName}
              disabled={isSubmitting}
            />
            <View style={{ height: 12 }} />
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
              Create account
            </Button>
            <View style={{ height: 12 }} />
            <Button onPress={() => navigation.navigate('Login')} disabled={isSubmitting}>
              Back to login
            </Button>
          </Card.Content>
        </Card>
      </View>
    </KeyboardAvoidingView>
  );
}


