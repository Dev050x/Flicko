import { requireOptionalNativeModule } from "expo";
import { TurboModuleRegistry, UIManager } from "react-native";

/*
 * Native modules added after the installed development build was made are missing from
 * it, and importing them throws. These loaders return null instead, so the app still
 * opens; a new development build brings the real modules back. Checking the native name
 * first avoids the failing import (and its logged error).
 */
const loaded = new Map<string, unknown>();

const optional = <T>(name: string, native: string, load: () => T): T | null => {
  if (loaded.has(name)) return loaded.get(name) as T | null;
  let module: T | null = null;
  try {
    if (requireOptionalNativeModule(native)) module = load();
  } catch {
    module = null;
  }
  if (!module) {
    console.warn(
      `[native] ${name} is not in this build; make a new development build to use it`,
    );
  }
  loaded.set(name, module);
  return module;
};

export const secureStore = () =>
  optional(
    "expo-secure-store",
    "ExpoSecureStore",
    () => require("expo-secure-store") as typeof import("expo-secure-store"),
  );

export const camera = () =>
  optional(
    "expo-camera",
    "ExpoCamera",
    () => require("expo-camera") as typeof import("expo-camera"),
  );

export const notifications = () =>
  optional(
    "expo-notifications",
    "ExpoNotificationPermissionsModule",
    () => require("expo-notifications") as typeof import("expo-notifications"),
  );

export const audio = () =>
  optional(
    "expo-audio",
    "ExpoAudio",
    () => require("expo-audio") as typeof import("expo-audio"),
  );

export const brightness = () =>
  optional(
    "expo-brightness",
    "ExpoBrightness",
    () => require("expo-brightness") as typeof import("expo-brightness"),
  );

/*
 * The live camera needs VisionCamera (a Nitro module) and Skia; the swipe shell needs
 * the pager view. Builds made before these were added fall back instead of crashing.
 */
let cameraStack: boolean | undefined;

export const hasCameraStack = () => {
  if (cameraStack !== undefined) return cameraStack;
  const missing: string[] = [];
  if (!TurboModuleRegistry.get("NitroModules")) missing.push("NitroModules");
  if (!TurboModuleRegistry.get("RNSkiaModule")) missing.push("RNSkiaModule");
  if (missing.length === 0) {
    try {
      const { NitroModules } =
        require("react-native-nitro-modules") as typeof import("react-native-nitro-modules");
      if (!NitroModules.hasHybridObject("CameraFactory")) {
        missing.push("VisionCamera (CameraFactory)");
      }
    } catch (err) {
      missing.push(`NitroModules (${String(err)})`);
    }
  }
  cameraStack = missing.length === 0;
  if (!cameraStack) {
    console.warn(
      `[native] the camera is not in this build (missing ${missing.join(", ")}); falling back to expo-camera; make a new development build for live filters`,
    );
  }
  return cameraStack;
};

export const hasSkia = () => !!TurboModuleRegistry.get("RNSkiaModule");

export const hasPager = () => UIManager.hasViewManagerConfig("RNCViewPager");

export const mediaLibrary = () =>
  optional(
    "expo-media-library",
    "ExpoMediaLibrary",
    () => require("expo-media-library") as typeof import("expo-media-library"),
  );
