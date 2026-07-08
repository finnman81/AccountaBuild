import React, { useContext, useState } from 'react';
import { KeyboardAvoidingView, Platform, View, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/types';
import { AuthContext } from '../store/AuthContext';
import GlowBackground from '../components/ui/GlowBackground';
import AppText from '../components/ui/AppText';
import TextField from '../components/ui/TextField';
import PrimaryButton from '../components/ui/PrimaryButton';
import SocialAuthButtons from '../components/auth/SocialAuthButtons';
import AuthHeader from '../components/auth/AuthHeader';
import { colors, spacing } from '../theme';

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
    if (!displayName.trim()) {
      setError('Please enter a display name.');
      return;
    }
    setIsSubmitting(true);
    try {
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
    <GlowBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <AuthHeader title="Create your account" subline="Start your first week and bring your crew." />

            <SocialAuthButtons
              onApple={() => Alert.alert('Coming soon', 'Apple sign-up is on the way — use email for now.')}
              onGoogle={() => Alert.alert('Coming soon', 'Google sign-up is on the way — use email for now.')}
            />

            <View style={styles.divider}>
              <View style={styles.hairline} />
              <AppText variant="label" color="muted">or with email</AppText>
              <View style={styles.hairline} />
            </View>

            <View style={styles.form}>
              <TextField placeholder="Display name" value={displayName} onChangeText={setDisplayName} editable={!isSubmitting} autoCapitalize="words" />
              <TextField placeholder="you@email.com" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={email} onChangeText={setEmail} editable={!isSubmitting} />
              <TextField placeholder="Password (min 6 characters)" secure value={password} onChangeText={setPassword} editable={!isSubmitting} />
              {error ? <AppText variant="rowSubtitle" color="danger">{error}</AppText> : null}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <PrimaryButton onPress={onSubmit} loading={isSubmitting} disabled={isSubmitting} style={styles.cta}>
              Create account
            </PrimaryButton>
            <View style={styles.footerRow}>
              <AppText variant="rowSubtitle" color="muted">Already have an account? </AppText>
              <TouchableOpacity onPress={() => navigation.navigate('Login')} disabled={isSubmitting}>
                <AppText variant="rowSubtitle" color="accent">Sign in</AppText>
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
  form: { gap: spacing.md },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.base, paddingTop: spacing.sm },
  cta: { width: '100%' },
  footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.base },
});
