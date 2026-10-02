import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

/*
 * Soft radial glow, CSS `radial-gradient(circle, color 0%, transparent 70%)` on a square box;
 * `stops` overrides the falloff (offsets are fractions of the farthest-corner radius).
 */
export function Glow({
  size,
  color = "#5B2BFF",
  opacity = 0.38,
  id = "glow",
  stops = [
    { offset: 0, opacity },
    { offset: 0.7, opacity: 0 },
  ],
}: {
  size: number;
  color?: string;
  opacity?: number;
  id?: string;
  stops?: { offset: number; opacity: number }[];
}) {
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="70.71%">
          {stops.map((stop) => (
            <Stop
              key={stop.offset}
              offset={stop.offset}
              stopColor={color}
              stopOpacity={stop.opacity}
            />
          ))}
        </RadialGradient>
      </Defs>
      <Rect width={size} height={size} fill={`url(#${id})`} />
    </Svg>
  );
}
