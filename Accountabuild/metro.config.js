const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const root = path.resolve(__dirname, '..');

const config = {
  watchFolders: [root],
  resolver: {
    extraNodeModules: {
      src: path.join(root, 'src'),
      '@babel/runtime': path.join(__dirname, 'node_modules', '@babel', 'runtime'),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
