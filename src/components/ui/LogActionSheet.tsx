import React from 'react';
import { View } from 'react-native';
import { Button, Card, Modal, Portal, Text, useTheme } from 'react-native-paper';

type Props = {
  visible: boolean;
  onDismiss: () => void;
  groupId: string | null;
  onGoToGroups: () => void;
  onLogCalories: (groupId: string) => void;
  onLogWorkout: (groupId: string) => void;
  onLogWeight: (groupId: string) => void;
  onAddPhoto: (groupId: string) => void;
};

export default function LogActionSheet(props: Props) {
  const theme = useTheme();
  const gid = props.groupId;

  return (
    <Portal>
      <Modal
        visible={props.visible}
        onDismiss={props.onDismiss}
        contentContainerStyle={{
          margin: 16,
          marginTop: 'auto',
          borderRadius: 16,
          overflow: 'hidden',
          backgroundColor: theme.colors.surface,
        }}
      >
        <Card>
          <Card.Title title="Quick log" subtitle="Choose an action" />
          <Card.Content>
            {!gid ? (
              <>
                <Text style={{ opacity: 0.75 }}>Pick a group first to log into.</Text>
                <View style={{ height: 12 }} />
                <Button mode="contained" onPress={props.onGoToGroups}>
                  Go to Groups
                </Button>
              </>
            ) : (
              <>
                <Button mode="contained" onPress={() => props.onLogWorkout(gid)}>
                  Log workout
                </Button>
                <View style={{ height: 10 }} />
                <Button mode="contained" onPress={() => props.onLogCalories(gid)}>
                  Log calories
                </Button>
                <View style={{ height: 10 }} />
                <Button mode="contained" onPress={() => props.onLogWeight(gid)}>
                  Log weight
                </Button>
                <View style={{ height: 10 }} />
                <Button mode="contained" onPress={() => props.onAddPhoto(gid)}>
                  Add progress photo
                </Button>
              </>
            )}
            <View style={{ height: 12 }} />
            <Button mode="text" onPress={props.onDismiss}>
              Cancel
            </Button>
          </Card.Content>
        </Card>
      </Modal>
    </Portal>
  );
}

