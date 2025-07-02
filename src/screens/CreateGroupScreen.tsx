import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { TextInput, Button, Text } from 'react-native-paper';
import { createGroup } from '../api/groups';
import { CreateGroupScreenProps } from '../navigation/types';

const CreateGroupScreen = ({ navigation }: CreateGroupScreenProps) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleCreateGroup = async () => {
    if (!name) {
      Alert.alert('Error', 'Group name is required.');
      return;
    }
    setIsLoading(true);
    try {
      await createGroup(name, description);
      navigation.goBack(); // Go back to the group list screen
    } catch (error) {
      console.error('Failed to create group:', error);
      Alert.alert('Error', 'Failed to create group. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create a New Group</Text>
      <TextInput
        label="Group Name"
        value={name}
        onChangeText={setName}
        style={styles.input}
        disabled={isLoading}
      />
      <TextInput
        label="Description (optional)"
        value={description}
        onChangeText={setDescription}
        style={styles.input}
        multiline
        numberOfLines={3}
        disabled={isLoading}
      />
      <Button 
        mode="contained" 
        onPress={handleCreateGroup} 
        style={styles.button}
        loading={isLoading}
        disabled={isLoading}
      >
        Create Group
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

export default CreateGroupScreen; 