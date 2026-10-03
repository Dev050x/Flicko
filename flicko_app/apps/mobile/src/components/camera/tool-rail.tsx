import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Glass } from "@/components/ui/glass";
import { FlashIcon, FlipIcon, TimerIcon } from "@/components/ui/icons";
import { useCameraSettings } from "@/features/camera/settings";
import { colors } from "@/theme";

/*
 * Right rail: flip, flash (off → on → auto), timer (off → 3s → 10s). 40dp glass
 * circles 12dp apart, with hit slop up to 48dp.
 */
const FLASH_LABEL = { off: "Flash off", on: "Flash on", auto: "Flash auto" };

export function ToolRail() {
  const insets = useSafeAreaInsets();
  const { flash, timer, flip, cycleFlash, cycleTimer } = useCameraSettings();

  return (
    <View style={[styles.rail, { top: insets.top + 12 }]}>
      <RailButton
        label="Flip camera"
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
            () => {},
          );
          flip();
        }}
      >
        <FlipIcon />
      </RailButton>
      <RailButton label={FLASH_LABEL[flash]} onPress={cycleFlash}>
        <FlashIcon off={flash === "off"} />
        {flash === "auto" && <Text style={styles.badge}>A</Text>}
      </RailButton>
      <RailButton
        label={timer ? `Timer ${timer} seconds` : "Timer off"}
        onPress={cycleTimer}
      >
        {timer ? <Text style={styles.text}>{timer}s</Text> : <TimerIcon />}
      </RailButton>
    </View>
  );
}

function RailButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
    >
      <Glass style={styles.button}>{children}</Glass>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rail: { position: "absolute", right: 16, gap: 12 },
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { fontFamily: "DMSans_700Bold", fontSize: 12, color: colors.text },
  badge: {
    position: "absolute",
    right: 6,
    bottom: 4,
    fontFamily: "DMSans_700Bold",
    fontSize: 9,
    color: colors.text,
  },
});
