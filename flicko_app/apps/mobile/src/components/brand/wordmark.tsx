import MaskedView from "@react-native-masked-view/masked-view";
import { StyleSheet, Text, View, type TextStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { gradientStops } from "@/brand/logo";

/*
 * "flicko" in Unbounded ExtraBold with the brand gradient on the final "o".
 * Letter spacing follows the designs: -1.2px at 34px, -5px at 128px.
 */
export function Wordmark({
  size,
  letterSpacing = -size * 0.037,
  opacity = 1,
}: {
  size: number;
  letterSpacing?: number;
  opacity?: number;
}) {
  const text: TextStyle = {
    fontFamily: "Unbounded_800ExtraBold",
    fontSize: size,
    lineHeight: size * 1.25,
    letterSpacing,
    includeFontPadding: false,
  };

  return (
    <View className="flex-row" style={{ opacity }}>
      <Text style={[text, { color: "#fff" }]}>flick</Text>
      <MaskedView maskElement={<Text style={text}>o</Text>}>
        <Text style={[text, { opacity: 0 }]}>o</Text>
        <Svg style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="wordmark" x1="0" y1="1" x2="1" y2="0">
              {gradientStops.map((stop) => (
                <Stop
                  key={stop.offset}
                  offset={stop.offset}
                  stopColor={stop.color}
                />
              ))}
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#wordmark)" />
        </Svg>
      </MaskedView>
    </View>
  );
}
