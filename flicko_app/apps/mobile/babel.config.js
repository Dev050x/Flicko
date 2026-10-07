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
        test: /node_modules[\\/]react-native-filament[\\/]/,
        plugins: ["react-native-worklets-core/plugin"],
      },
    ],
  };
};
