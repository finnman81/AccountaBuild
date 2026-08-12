import React, { useContext, useState } from 'react';
import { KeyboardAvoidingView, Platform, View, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Icon } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { AuthContext } from '../store/AuthContext';
import { RootStackParamList } from '../navigation/types';
import GlowBackground from '../components/ui/GlowBackground';
import AppText from '../components/ui/AppText';
import TextField from '../components/ui/TextField';
import PrimaryButton from '../components/ui/PrimaryButton';
import SocialAuthButtons from '../components/auth/SocialAuthButtons';
import AuthHeader from '../components/auth/AuthHeader';
import { colors, spacing } from '../theme';

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
    <GlowBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <AuthHeader title="Welcome back" subline="Log in to pick up where your group left off." />

            <SocialAuthButtons
              onApple={() => Alert.alert('Coming soon', 'Apple sign-in is on the way — use email for now.')}
              onGoogle={() => Alert.alert('Coming soon', 'Google sign-in is on the way — use email for now.')}
            />

            <View style={styles.divider}>
              <View style={styles.hairline} />
              <AppText variant="label" color="muted" style={styles.dividerLabel}>or with email</AppText>
              <View style={styles.hairline} />
            </View>

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
              <TextField
                placeholder="Password"
                secure
                value={password}
                onChangeText={setPassword}
                editable={!isSubmitting}
              />
              {error ? (
                <AppText variant="rowSubtitle" color="danger">{error}</AppText>
              ) : null}
              <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')} disabled={isSubmitting} style={styles.forgotWrap}>
                <AppText variant="rowSubtitle" color="accent">Forgot password?</AppText>
              </TouchableOpacity>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <PrimaryButton onPress={onSubmit} loading={isSubmitting} disabled={isSubmitting} style={styles.cta}>
              Sign in
            </PrimaryButton>
            <View style={styles.footerRow}>
              <AppText variant="rowSubtitle" color="muted">New here? </AppText>
              <TouchableOpacity onPress={() => navigation.navigate('Register')} disabled={isSubmitting}>
                <AppText variant="rowSubtitle" color="accent">Create an account</AppText>
              </TouchableOpacity>
            </View>
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
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.lg },
  hairline: { flex: 1, height: 1, backgroundColor: colors.divider },
  dividerLabel: { textTransform: 'lowercase' },
  form: { gap: spacing.md },
  forgotWrap: { alignSelf: 'flex-end', paddingVertical: spacing.xs },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.base, paddingTop: spacing.sm },
  cta: { width: '100%' },
  footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.base },
});
