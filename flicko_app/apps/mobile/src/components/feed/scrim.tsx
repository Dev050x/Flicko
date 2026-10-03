import { StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

/*
 * A vertical fade of `color` from opacity `from` (top) to `to` (bottom), drawn with
 * SVG. The opacity goes in stopOpacity: Android ignores the alpha of an rgba stopColor
 * and draws the stop solid.
 */
export function Scrim({
  id,
  color,
  from,
  to,
  style,
}: {
  id: string;
  color: string;
  from: number;
  to: number;
  style: ViewStyle;
}) {
  return (
    <View pointerEvents="none" style={style}>
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 1 1">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={from} />
            <Stop offset="1" stopColor={color} stopOpacity={to} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="1" height="1" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
