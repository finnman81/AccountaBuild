/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/testing'],
  setupFilesAfterEnv: ['<rootDir>/testing/jest.setup.ts'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transformIgnorePatterns: [
    // Expo SDK 54: expo-modules-core exports TS sources; we must transform them.
    // Note: use `expo-.*` (not `expo-`) so it matches full module names like `expo-modules-core`.
    'node_modules/(?!(jest-)?react-native|@react-native|@react-navigation|expo(nent)?|expo-.*|expo-modules-core|@expo(nent)?/.*|react-native-paper|react-native-svg|react-native-reanimated/.*)',
  ],
};

