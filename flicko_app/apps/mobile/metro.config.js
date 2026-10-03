const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

/*
 * Two Solana dependencies resolve fine but make Metro warn on every start:
 * - rpc-websockets only lists "browser"/"node" export conditions, so point it at the
 *   browser build (what @solana/web3.js expects in React Native);
 * - @noble/hashes maps "./crypto" to "./crypto.js" via its "browser" field, which its
 *   own "exports" doesn't list; load the file next to the importer directly.
 */
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "rpc-websockets") {
    return context.resolveRequest(
      { ...context, unstable_conditionNames: ["browser", "require"] },
      moduleName,
      platform,
    );
  }
  if (
    moduleName === "@noble/hashes/crypto" &&
    context.originModulePath.includes(`${path.sep}@noble${path.sep}hashes${path.sep}`)
  ) {
    return {
      type: "sourceFile",
      filePath: path.join(path.dirname(context.originModulePath), "crypto.js"),
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./src/global.css" });
