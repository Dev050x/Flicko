import { Text, View } from "react-native";

import { config } from "@/config";
import { colors, ref } from "@/theme";

/*
 * Amber dot + cluster name, shown only off mainnet.
 */
export function DevnetPill() {
  if (config.cluster === "mainnet-beta") return null;
  const name = config.cluster[0]!.toUpperCase() + config.cluster.slice(1);
  return (
    <View
      accessibilityLabel={`Connected to ${name}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        height: 28,
        paddingHorizontal: 12,
        borderRadius: 14,
        backgroundColor: ref.pillBg,
        borderWidth: 1,
        borderColor: ref.line,
      }}
    >
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: 4,
          backgroundColor: colors.warning,
        }}
      />
      <Text
        style={{
          fontFamily: "DMSans_500Medium",
          fontSize: 12,
          color: ref.textBright,
        }}
      >
        {name}
      </Text>
    </View>
  );
}
