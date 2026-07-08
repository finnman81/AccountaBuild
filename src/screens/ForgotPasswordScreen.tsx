import React, { useContext, useState } from 'react';
import { KeyboardAvoidingView, Platform, View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/types';
import { AuthContext } from '../store/AuthContext';
import GlowBackground from '../components/ui/GlowBackground';
import AppText from '../components/ui/AppText';
import TextField from '../components/ui/TextField';
import PrimaryButton from '../components/ui/PrimaryButton';
import AuthHeader from '../components/auth/AuthHeader';
import { spacing } from '../theme';

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
    <GlowBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <AuthHeader title="Reset your password" subline="We'll email you a link to set a new one." />

            <View style={styles.form}>
              <TextField
                placeholder="you@email.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                editable={!isSubmitting}
              />
              {error ? <AppText variant="rowSubtitle" color="danger">{error}</AppText> : null}
              {message ? <AppText variant="rowSubtitle" color="success">{message}</AppText> : null}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <PrimaryButton onPress={onSubmit} loading={isSubmitting} disabled={isSubmitting} style={styles.cta}>
              Send reset email
            </PrimaryButton>
            <TouchableOpacity onPress={() => navigation.navigate('Login')} disabled={isSubmitting} style={styles.backWrap}>
              <AppText variant="rowSubtitle" color="accent">Back to sign in</AppText>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GlowBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xxl },
  form: { gap: spacing.md },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.base, paddingTop: spacing.sm },
  cta: { width: '100%' },
  backWrap: { alignItems: 'center', marginTop: spacing.base, paddingVertical: spacing.xs },
});
