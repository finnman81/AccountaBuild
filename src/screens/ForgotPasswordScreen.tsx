import React, { useContext, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Button, Card, Text, TextInput } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/types';
import { AuthContext } from '../store/AuthContext';

type Props = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>;

export default function ForgotPasswordScreen({ navigation }: Props) {
  const { resetPassword } = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    setMessage(null);
    setIsSubmitting(true);
    try {
      await resetPassword(email);
      setMessage('Password reset email sent. Check your inbox.');
    } catch (e) {
      setError('Could not send reset email. Check the email address.');
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
          <Card.Title title="Reset your password" />
          <Card.Content>
            <TextInput
              label="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              disabled={isSubmitting}
            />
            {error ? (
              <>
                <View style={{ height: 12 }} />
                <Text style={{ color: 'crimson' }}>{error}</Text>
              </>
            ) : null}
            {message ? (
              <>
                <View style={{ height: 12 }} />
                <Text style={{ color: 'green' }}>{message}</Text>
              </>
            ) : null}
            <View style={{ height: 16 }} />
            <Button mode="contained" onPress={onSubmit} loading={isSubmitting} disabled={isSubmitting}>
              Send reset email
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


