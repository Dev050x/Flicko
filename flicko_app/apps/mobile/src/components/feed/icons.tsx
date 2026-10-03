import Svg, { Circle, Path } from "react-native-svg";

import { feed } from "@/theme";

/*
 * Feed icons (24x24 viewBox): solid ones for the action rail, line ones for controls.
 */
type IconProps = { size?: number; color?: string };

export function HeartIcon({ size = 30, color = feed.text }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Path
        d="M12 20.6s-7.4-4.4-9.5-8.9C1 8.4 3 4.4 6.8 4.4c2.2 0 3.7 1.2 5.2 3.1 1.5-1.9 3-3.1 5.2-3.1 3.8 0 5.8 4 4.3 7.3-2.1 4.5-9.5 8.9-9.5 8.9z"
        fill={color}
      />
    </Svg>
  );
}

export function BubbleIcon({ size = 30, color = feed.text }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Path
        d="M12 3.2c-5.5 0-10 3.7-10 8.2 0 2.5 1.3 4.6 3.4 6.1L4.5 21l4.3-2c1 .3 2.1.5 3.2.5 5.5 0 10-3.7 10-8.2S17.5 3.2 12 3.2z"
        fill={color}
      />
    </Svg>
  );
}

export function RemixIcon({ size = 30, color = feed.text }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Path
        fillRule="evenodd"
        d="M9 4.5h6l1.6 2.2H20a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.7a2 2 0 0 1 2-2h3.4L9 4.5zM12 9.4a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 0 0 0-7.4z"
        fill={color}
      />
    </Svg>
  );
}

export function ShareArrowIcon({ size = 30, color = feed.text }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Path d="M13.6 4.2v4.3C7.2 9.2 3.7 13.4 2.6 19.6c2.6-3.6 6-5.1 11-5.1v4.3l7.9-7.3-7.9-7.3z" fill={color} />
    </Svg>
  );
}

export function SearchIcon({ size = 24, color = feed.text }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <Circle cx={10.8} cy={10.8} r={6.6} stroke={color} strokeWidth={2.2} />
      <Path d="M15.8 15.8l4.4 4.4" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

const line = (color: string) => ({
  fill: "none",
  stroke: color,
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function PlusIcon({ size = 22, color = feed.text }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Path d="M12 4.5v15M4.5 12h15" {...line(color)} strokeWidth={2.4} />
    </Svg>
  );
}

export function MinusIcon({ size = 22, color = feed.text }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Path d="M5 12h14" {...line(color)} strokeWidth={2.2} />
    </Svg>
  );
}
