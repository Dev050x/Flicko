module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    overrides: [
      {
        // react-native-filament runs its worklets on react-native-worklets-core, a different
        // runtime from Reanimated's. Plugins run before presets, so its own plugin handles
        // the 'worklet' functions in that package before Reanimated's plugin sees them.
        // A function, not a RegExp: Metro also loads this config without a filename (for
        // its cache key), and Babel rejects string/RegExp patterns then.
        test: (filename) =>
          !!filename && /node_modules[\\/]react-native-filament[\\/]/.test(filename),
        plugins: ["react-native-worklets-core/plugin"],
      },
    ],
  };
};
