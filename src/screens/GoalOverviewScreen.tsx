import React, { useState, useCallback } from 'react';
import { View, FlatList, StyleSheet, Alert, RefreshControl } from 'react-native';
import { Button, Card, Title, Paragraph, ProgressBar, ActivityIndicator, IconButton, Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { getGoals, deleteGoal, updateGoal, Goal } from '../api/goals';
import { GoalOverviewScreenProps } from '../navigation/types';

const GoalOverviewScreen = ({ navigation }: GoalOverviewScreenProps) => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchGoals = async () => {
    try {
      const fetchedGoals = await getGoals();
      setGoals(fetchedGoals);
    } catch (error) {
      console.error('Error fetching goals on screen:', error);
      Alert.alert('Error', 'Could not fetch your goals.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      fetchGoals();
    }, [])
  );

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchGoals();
  };

  const handleDelete = (goalId: string) => {
    Alert.alert('Delete Goal', 'Are you sure you want to delete this goal?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        onPress: async () => {
          try {
            await deleteGoal(goalId);
            setGoals((prevGoals: Goal[]) => prevGoals.filter(goal => goal.id !== goalId));
          } catch (error) {
            Alert.alert('Error', 'Could not delete the goal.');
          }
        },
        style: 'destructive',
      },
    ]);
  };

  const handleUpdateProgress = async (goal: Goal) => {
    // For simplicity, we'll just increment progress by 1
    const newProgress = goal.progress + 1;
    if (newProgress > goal.target) return;

    try {
      const updated = await updateGoal(goal.id, { progress: newProgress });
      setGoals((prevGoals: Goal[]) => prevGoals.map(g => (g.id === goal.id ? updated : g)));
    } catch (error) {
      Alert.alert('Error', 'Could not update progress.');
    }
  };

  if (isLoading) {
    return <ActivityIndicator animating={true} style={styles.loader} />;
  }

  const renderItem = ({ item }: { item: Goal }) => (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.cardHeader}>
          <Title>{item.description}</Title>
          <IconButton icon="delete" onPress={() => handleDelete(item.id)} />
        </View>
        <Paragraph>
          Progress: {item.progress} / {item.target}
        </Paragraph>
        <ProgressBar progress={item.progress / item.target} style={styles.progressBar} />
      </Card.Content>
      <Card.Actions>
        <Button onPress={() => handleUpdateProgress(item)}>Increment Progress</Button>
      </Card.Actions>
    </Card>
  );

  return (
    <View style={styles.container}>
      <Button
        mode="contained"
        onPress={() => navigation.navigate('CreateGoal')}
        style={styles.button}
      >
        Create New Goal
      </Button>
      {goals.length === 0 ? (
        <Text style={styles.emptyText}>You haven't set any goals yet.</Text>
      ) : (
        <FlatList
          data={goals}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { margin: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressBar: { marginTop: 10 },
  button: { margin: 10 },
  emptyText: { textAlign: 'center', marginTop: 20 },
});

export default GoalOverviewScreen; 