import React from 'react';
import { Modal, Portal } from 'react-native-paper';
import { ScrollView, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import MemberDetailCard from './MemberDetailCard';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import type { MemberSummary } from '../../viewmodels/memberSummary';

type MemberDetailModalProps = {
  visible: boolean;
  member: MemberSummary | null;
  mode: 'calories' | 'workout' | 'weight';
  onDismiss: () => void;
};

export default function MemberDetailModal({
  visible,
  member,
  mode,
  onDismiss,
}: MemberDetailModalProps) {
  const theme = useTheme();

  if (!member) return null;

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          styles.modalContent,
          {
            backgroundColor: theme.colors.surface,
            borderRadius: radius.card,
          },
        ]}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <MemberDetailCard item={member} mode={mode} />
        </ScrollView>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    margin: spacing.base,
    marginTop: 'auto',
    maxHeight: '80%',
    overflow: 'hidden',
  },
  scrollContent: {
    padding: spacing.base,
  },
});
