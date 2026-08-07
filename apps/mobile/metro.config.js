// Metro config for monorepo — self-contained mobile app
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// Add .cjs extension for React Native compatibility
config.resolver.sourceExts = [...config.resolver.sourceExts, "cjs"];

// Polyfill aliases for browser modules used by some packages
config.resolver.extraNodeModules = {
  stream: require.resolve("stream-browserify"),
  querystring: require.resolve("querystring-es3"),
};

module.exports = config;
