import React, { useContext } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { AuthContext } from '../store/AuthContext';
import { HomeScreenProps } from '../navigation/types';

const HomeScreen = ({ navigation }: HomeScreenProps) => {
  const auth = useContext(AuthContext);

  const handleLogout = () => {
    auth.logout();
    // Navigation will be handled by the AppNavigator
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Home Screen</Text>
      <Text>Welcome to Accountabuild!</Text>
      <Button 
        mode="contained" 
        onPress={() => navigation.navigate('GroupList')} 
        style={styles.button}
      >
        View My Groups
      </Button>
      <Button 
        mode="contained" 
        onPress={() => navigation.navigate('GoalOverview')} 
        style={styles.button}
      >
        View My Goals
      </Button>
      <Button mode="outlined" onPress={handleLogout} style={styles.button}>
        Logout
      </Button>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  button: {
    marginTop: 20,
  },
});

export default HomeScreen; 