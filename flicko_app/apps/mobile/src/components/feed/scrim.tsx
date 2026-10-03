import { StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

/* A vertical fade from `from` to `to` (rgba strings), drawn with SVG. */
export function Scrim({
  id,
  from,
  to,
  style,
}: {
  id: string;
  from: string;
  to: string;
  style: ViewStyle;
}) {
  return (
    <View pointerEvents="none" style={style}>
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 1 1">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="1" height="1" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
