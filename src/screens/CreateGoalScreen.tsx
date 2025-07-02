import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { TextInput, Button, Text } from 'react-native-paper';
import { createGoal } from '../api/goals';
import { CreateGoalScreenProps } from '../navigation/types';

const CreateGoalScreen = ({ navigation }: CreateGoalScreenProps) => {
  const [description, setDescription] = useState('');
  const [target, setTarget] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleCreateGoal = async () => {
    const targetNumber = parseInt(target, 10);
    if (!description || isNaN(targetNumber) || targetNumber <= 0) {
      Alert.alert('Error', 'Please enter a valid description and a positive target number.');
      return;
    }
    setIsLoading(true);
    try {
      await createGoal(description, targetNumber);
      navigation.goBack();
    } catch (error) {
      console.error('Failed to create goal:', error);
      Alert.alert('Error', 'Failed to create goal. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Set a New Goal</Text>
      <TextInput
        label="Goal Description"
        value={description}
        onChangeText={setDescription}
        style={styles.input}
        disabled={isLoading}
      />
      <TextInput
        label="Target (e.g., 5 workouts)"
        value={target}
        onChangeText={setTarget}
        style={styles.input}
        keyboardType="number-pad"
        disabled={isLoading}
      />
      <Button
        mode="contained"
        onPress={handleCreateGoal}
        style={styles.button}
        loading={isLoading}
        disabled={isLoading}
      >
        Set Goal
      </Button>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
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

export default CreateGoalScreen; 