import Constants from "expo-constants";

import { api } from "@/lib/api";
import { notifications } from "@/lib/native";

/*
 * Registers this device for push notifications with the server (PUT /me/push-token).
 * Returns false when it can't: no permission, notifications missing from the build, or
 * Android without Firebase set up (getExpoPushTokenAsync throws). Never throws.
 */
export const registerPush = async (sessionToken: string): Promise<boolean> => {
  const Notifications = notifications();
  if (!Notifications) return false;
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted")
      ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== "granted") return false;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as
      string | undefined;
    const { data } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : {},
    );
    await api("/me/push-token", {
      method: "PUT",
      body: { token: data },
      token: sessionToken,
    });
    return true;
  } catch (err) {
    console.warn("[push] not registered", (err as Error)?.message);
    return false;
  }
};
