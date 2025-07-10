import 'react-native-gesture-handler/jestSetup';

// Mock AsyncStorage (simple mock)
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

// Mock react-native-keychain
jest.mock('react-native-keychain', () => ({
  setInternetCredentials: jest.fn(),
  getInternetCredentials: jest.fn(),
  resetInternetCredentials: jest.fn(),
}));

// Mock react-native-health
jest.mock('react-native-health', () => ({
  initHealthKit: jest.fn(),
  getPermissions: jest.fn(),
  requestPermissions: jest.fn(),
  getSamples: jest.fn(),
}));

// Mock react-native-image-picker
jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(),
  launchCamera: jest.fn(),
}));

// Mock react-native-permissions
jest.mock('react-native-permissions', () => ({
  request: jest.fn(),
  check: jest.fn(),
  PERMISSIONS: {
    IOS: {
      CAMERA: 'ios.permission.CAMERA',
      PHOTO_LIBRARY: 'ios.permission.PHOTO_LIBRARY',
    },
  },
  RESULTS: {
    GRANTED: 'granted',
    DENIED: 'denied',
    BLOCKED: 'blocked',
  },
}));

// Mock Socket.IO
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    on: jest.fn(),
    emit: jest.fn(),
    off: jest.fn(),
    disconnect: jest.fn(),
    connect: jest.fn(),
  })),
}));

// Mock navigation
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: jest.fn(),
      goBack: jest.fn(),
      reset: jest.fn(),
    }),
    useRoute: () => ({
      params: {},
    }),
    useFocusEffect: jest.fn(),
  };
});

// Mock react-native-paper
jest.mock('react-native-paper', () => {
  const RealComponent = jest.requireActual('react-native-paper');
  const MockedComponent = ({ children, ...props }) => {
    return children || props.label || props.title || null;
  };
  
  return {
    ...RealComponent,
    Provider: MockedComponent,
    Portal: MockedComponent,
    Button: MockedComponent,
    TextInput: MockedComponent,
    Text: MockedComponent,
    Card: MockedComponent,
    IconButton: MockedComponent,
  };
});

// Silence console warnings during tests
console.warn = jest.fn();
console.error = jest.fn(); 