import React, { useState, useEffect, useCallback, useContext } from 'react';
import { View, StyleSheet, FlatList, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Button, Text, ActivityIndicator } from 'react-native-paper';
import { getMessages, Message } from '../api/messages';
import { getSocket } from '../socket/socket';
import { AuthContext } from '../store/AuthContext';
import { ChatScreenProps } from '../navigation/types';

const ChatScreen = ({ route }: ChatScreenProps) => {
  const { groupId } = route.params;
  const { user } = useContext(AuthContext);
  const socket = getSocket();

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);

  const fetchMessages = async () => {
    if (isLoading) return; // Prevent multiple fetches
    setIsLoading(true);
    try {
      const fetchedMessages = await getMessages(groupId, page);
      setMessages((prevMessages) => [...prevMessages, ...fetchedMessages]);
      setPage((prevPage) => prevPage + 1);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();

    socket.connect();
    socket.emit('joinGroup', groupId);

    socket.on('newMessage', (message: Message) => {
      setMessages((prevMessages) => [message, ...prevMessages]);
    });

    return () => {
      socket.emit('leaveGroup', groupId);
      socket.off('newMessage');
      socket.disconnect();
    };
  }, [groupId, socket]);
  
  const handleSend = () => {
    if (newMessage.trim()) {
      socket.emit('sendMessage', {
        content: newMessage.trim(),
        groupId: groupId,
      });
      setNewMessage('');
    }
  };
  
  const renderItem = ({ item }: { item: Message }) => {
    const isMe = user && item.userId === user.id;
    return (
      <View style={[styles.messageBubble, isMe ? styles.myMessage : styles.theirMessage]}>
        {!isMe && <Text style={styles.username}>{item.user.username}</Text>}
        <Text style={styles.messageText}>{item.content}</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={100}
    >
      {isLoading && page === 1 ? (
        <ActivityIndicator animating={true} style={styles.loader} />
      ) : (
        <FlatList
          inverted
          data={messages}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          onEndReached={fetchMessages}
          onEndReachedThreshold={0.5}
          ListFooterComponent={isLoading && messages.length > 0 ? <ActivityIndicator /> : null}
        />
      )}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={newMessage}
          onChangeText={setNewMessage}
          placeholder="Type a message..."
        />
        <Button onPress={handleSend}>Send</Button>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  inputContainer: { flexDirection: 'row', padding: 10, borderTopWidth: 1, borderColor: '#ccc' },
  input: { flex: 1, marginRight: 10 },
  messageBubble: { padding: 10, borderRadius: 20, marginVertical: 5, maxWidth: '80%' },
  myMessage: { backgroundColor: '#dcf8c6', alignSelf: 'flex-end', marginRight: 10 },
  theirMessage: { backgroundColor: '#fff', alignSelf: 'flex-start', marginLeft: 10 },
  username: { fontWeight: 'bold', marginBottom: 2 },
  messageText: { fontSize: 16 }
});

export default ChatScreen; 