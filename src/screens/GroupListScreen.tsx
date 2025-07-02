import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { Button, Card, Title, Paragraph, ActivityIndicator, Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { getMyGroups, Group } from '../api/groups';
import { GroupListScreenProps } from '../navigation/types';

const GroupListScreen = ({ navigation }: GroupListScreenProps) => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchGroups = async () => {
    try {
      const fetchedGroups = await getMyGroups();
      setGroups(fetchedGroups);
    } catch (error) {
      console.error('Error fetching groups on screen:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      fetchGroups();
    }, [])
  );

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchGroups();
  };

  if (isLoading) {
    return <ActivityIndicator animating={true} style={styles.loader} />;
  }
  
  const renderItem = ({ item }: { item: Group }) => (
    <Card 
      style={styles.card}
      onPress={() => navigation.navigate('Chat', { groupId: item.id })}
    >
      <Card.Content>
        <Title>{item.name}</Title>
        <Paragraph>{item.description}</Paragraph>
      </Card.Content>
    </Card>
  );

  return (
    <View style={styles.container}>
      <Button 
        mode="contained" 
        onPress={() => navigation.navigate('CreateGroup')} 
        style={styles.button}
      >
        Create New Group
      </Button>
      {groups.length === 0 ? (
        <Text style={styles.emptyText}>You are not a member of any groups yet.</Text>
      ) : (
        <FlatList
          data={groups}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    margin: 10,
  },
  button: {
    margin: 10,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 20,
  },
});

export default GroupListScreen; 