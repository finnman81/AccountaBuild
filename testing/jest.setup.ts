import '@testing-library/jest-native/extend-expect';

// Safe area mock for tests (Paper expects SafeAreaInsetsContext.Consumer to exist).
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  const insets = { top: 0, bottom: 0, left: 0, right: 0 };

  const SafeAreaInsetsContext = React.createContext(insets);
  const SafeAreaFrameContext = React.createContext({ x: 0, y: 0, width: 0, height: 0 });

  return {
    SafeAreaView: ({ children, style }: any) => React.createElement(View, { style }, children),
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaInsetsContext,
    SafeAreaFrameContext,
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 0, height: 0 }),
  };
});

// Icon-font mock. On device, react-native-paper renders MaterialCommunityIcons
// via @expo/vector-icons (installed). In the node/jest env that package pulls in
// native font modules that don't load, so paper would fall back and warn
// ("none of the required icon libraries are installed") — misleading noise now
// that the real dependency is present. Provide a lightweight stand-in so the
// icon resolves cleanly in tests.
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ name, color, size }: any) =>
      React.createElement(Text, { accessibilityRole: 'image', style: { color, fontSize: size } }, name),
  };
});

// Reanimated mock (required by many RN setups).
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// Gesture handler mock (basic stub).
jest.mock('react-native-gesture-handler', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const View = require('react-native/Libraries/Components/View/View');
  return {
    Swipeable: View,
    DrawerLayout: View,
    State: {},
    PanGestureHandler: View,
    TapGestureHandler: View,
    LongPressGestureHandler: View,
    ForceTouchGestureHandler: View,
    RotationGestureHandler: View,
    FlingGestureHandler: View,
    PinchGestureHandler: View,
    NativeViewGestureHandler: View,
    Directions: {},
  };
});

// Firebase Firestore mock for screens that set up listeners.
jest.mock('firebase/firestore', () => {
  return {
    collection: jest.fn(() => ({})),
    doc: jest.fn(() => ({})),
    query: jest.fn(() => ({})),
    where: jest.fn(() => ({})),
    orderBy: jest.fn(() => ({})),
    limit: jest.fn(() => ({})),
    documentId: jest.fn(() => '__name__'),
    increment: jest.fn((n: number) => n),
    serverTimestamp: jest.fn(() => ({ __type: 'serverTimestamp' })),
    onSnapshot: jest.fn((_ref: any, onNext: any) => {
      // Call immediately with empty snapshot-ish object.
      if (typeof onNext === 'function') {
        onNext({ docs: [], exists: () => false, data: () => ({}) });
      }
      return () => {};
    }),
    getDoc: jest.fn(async () => ({ exists: () => false, data: () => ({}) })),
    getDocs: jest.fn(async () => ({ docs: [], size: 0 })),
    setDoc: jest.fn(async () => {}),
    updateDoc: jest.fn(async () => {}),
    addDoc: jest.fn(async () => ({ id: 'test' })),
    deleteDoc: jest.fn(async () => {}),
  };
});

