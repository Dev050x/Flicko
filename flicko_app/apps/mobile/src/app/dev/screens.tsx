import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";

import type { ConnectState } from "@/components/wallet/connect-flow";
import { useFaceHudSwitch } from "@/features/face";
import Permissions from "@/screens/permissions";
import Profile from "@/screens/profile";
import Welcome from "@/screens/welcome";
import { colors, ref } from "@/theme";

/*
 * Dev preview of every onboarding screen and connect state (no wallet needed), for
 * comparing against design-reference/*.html. Open /dev/screens?s=<name>.
 */
const SCREENS = [
  "welcome",
  "opening",
  "success",
  "noWallet",
  "failed",
  "profile",
  "permissions",
] as const;
type Name = (typeof SCREENS)[number];

export default function DevScreens() {
  const hudOn = useFaceHudSwitch((s) => s.on);
  const { s } = useLocalSearchParams<{ s?: Name }>();
  if (s === "profile") return <Profile preview />;
  if (s === "permissions") return <Permissions />;
  if (s && s !== "welcome") return <Welcome preview={s as ConnectState} />;
  if (s === "welcome") return <Welcome />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 24, paddingTop: 64, gap: 8 }}
    >
      <Text
        onPress={() => useFaceHudSwitch.getState().toggle()}
        style={{
          fontFamily: "DMSans_700Bold",
          fontSize: 17,
          color: ref.textBright,
          paddingVertical: 12,
        }}
      >
        Camera face HUD: {hudOn ? "on" : "off"} (tap to toggle)
      </Text>
      {SCREENS.map((name) => (
        <View key={name}>
          <Text
            onPress={() =>
              router.push({ pathname: "/dev/screens", params: { s: name } })
            }
            style={{
              fontFamily: "DMSans_500Medium",
              fontSize: 17,
              color: ref.textBright,
              paddingVertical: 12,
            }}
          >
            {name}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}
