/*
 * Native modules added after the installed development build was made are missing from
 * it, and importing them throws. These loaders return null instead, so the app still
 * opens; a new development build brings the real modules back.
 */
const loaded = new Map<string, unknown>();

const optional = <T>(name: string, load: () => T): T | null => {
  if (loaded.has(name)) return loaded.get(name) as T | null;
  let module: T | null = null;
  try {
    module = load();
  } catch {
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
    () => require("expo-secure-store") as typeof import("expo-secure-store"),
  );

export const camera = () =>
  optional(
    "expo-camera",
    () => require("expo-camera") as typeof import("expo-camera"),
  );

export const notifications = () =>
  optional(
    "expo-notifications",
    () => require("expo-notifications") as typeof import("expo-notifications"),
  );
