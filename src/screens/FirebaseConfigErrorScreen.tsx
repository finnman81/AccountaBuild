import React from 'react';
import { ScrollView, View } from 'react-native';
import { Card, Text } from 'react-native-paper';

export default function FirebaseConfigErrorScreen() {
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Card>
        <Card.Title title="Firebase not configured" />
        <Card.Content>
          <Text variant="bodyMedium">
            This app needs Firebase environment variables to run.
          </Text>
          <View style={{ height: 12 }} />
          <Text variant="bodySmall">
            Add these to your local .env (and to EAS secrets later):
          </Text>
          <View style={{ height: 12 }} />
          <Text variant="bodySmall">EXPO_PUBLIC_FIREBASE_API_KEY</Text>
          <Text variant="bodySmall">EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN</Text>
          <Text variant="bodySmall">EXPO_PUBLIC_FIREBASE_PROJECT_ID</Text>
          <Text variant="bodySmall">EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET</Text>
          <Text variant="bodySmall">EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID</Text>
          <Text variant="bodySmall">EXPO_PUBLIC_FIREBASE_APP_ID</Text>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}


