import { Text, type TextStyle } from "react-native";

import { colors, fonts } from "@/theme";

/*
 * "flicko" in Unbounded ExtraBold: white "flick" and a solid accent "o" (no gradients
 * in UI). Letter spacing follows the designs: -0.8 at 22, -1.2 at 34.
 */
export function Wordmark({
  size,
  letterSpacing = -size * 0.036,
  opacity = 1,
}: {
  size: number;
  letterSpacing?: number;
  opacity?: number;
}) {
  const style: TextStyle = {
    fontFamily: fonts.wordmark,
    fontSize: size,
    lineHeight: size * 1.2,
    letterSpacing,
    color: colors.text,
    opacity,
    includeFontPadding: false,
  };
  return (
    <Text style={style} accessibilityRole="header" accessibilityLabel="flicko">
      flick<Text style={{ color: colors.accent }}>o</Text>
    </Text>
  );
}
