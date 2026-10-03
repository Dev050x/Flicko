import { Pressable, View } from "react-native";

import { colors, ref } from "@/theme";
import { ChevronLeftIcon } from "./icons";

/*
 * Onboarding top bar: back chevron and two 22x5 progress bars (accent = done/current).
 */
export function StepBar({
  step,
  onBack,
  backLabel = "Back",
}: {
  step: 1 | 2;
  onBack: () => void;
  backLabel?: string;
}) {
  return (
    <View
      style={{
        height: 48,
        paddingHorizontal: 8,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        onPress={onBack}
        style={{
          width: 48,
          height: 48,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ChevronLeftIcon />
      </Pressable>
      <View
        style={{ flexDirection: "row", gap: 6 }}
        accessibilityLabel={`Step ${step} of 2`}
      >
        {[1, 2].map((n) => (
          <View
            key={n}
            style={{
              width: 22,
              height: 5,
              borderRadius: 3,
              backgroundColor: n <= step ? colors.accent : ref.line,
            }}
          />
        ))}
      </View>
      <View style={{ width: 48 }} />
    </View>
  );
}
