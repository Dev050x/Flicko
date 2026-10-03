import Svg, { Circle, Path } from "react-native-svg";

import { feed } from "@/theme";

/*
 * Feed icons (24x24 viewBox, 2px round strokes).
 */
type IconProps = { size?: number; color?: string };

const line = (color: string) => ({
  fill: "none",
  stroke: color,
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

/*
 * Rail icons from the flicko-feed-icons kit: 24x24, 2px stroke, round caps and joins.
 * The comment bubble is drawn in the same style (the kit has no comment icon).
 */
const HEART =
  "M12 20.2 C6.2 16.3 3 12.9 3 9.1 A4.6 4.6 0 0 1 12 7.2 A4.6 4.6 0 0 1 21 9.1 C21 12.9 17.8 16.3 12 20.2 Z";

export function LikeIcon({
  size = 30,
  color = feed.text,
  filled = false,
}: IconProps & { filled?: boolean }) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Path d={HEART} {...line(color)} fill={filled ? color : "none"} />
    </Svg>
  );
}

export function CommentIcon({ size = 30, color = feed.text }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Path
        d="M12 4 C7 4 3.5 7.1 3.5 11 C3.5 13 4.4 14.7 6 16 L5.2 19.8 L9.4 17.6 C10.2 17.8 11.1 18 12 18 C17 18 20.5 14.9 20.5 11 C20.5 7.1 17 4 12 4 Z"
        {...line(color)}
      />
    </Svg>
  );
}

export function RemixIcon({ size = 30, color = feed.text }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Path
        d="M3.5 8.5 A2 2 0 0 1 5.5 6.5 H7.5 L9 4.5 H15 L16.5 6.5 H18.5 A2 2 0 0 1 20.5 8.5 V17.5 A2 2 0 0 1 18.5 19.5 H5.5 A2 2 0 0 1 3.5 17.5 Z"
        {...line(color)}
      />
      <Path d="M15.2 11.4 A3.4 3.4 0 1 0 15.1 14.9" {...line(color)} />
      <Path d="M15.6 9.4 V11.6 H13.4" {...line(color)} />
    </Svg>
  );
}

export function ShareIcon({ size = 30, color = feed.text }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Path d="M14 4.5 L20.5 11 L14 17.5" {...line(color)} />
      <Path d="M20.5 11 H11 A6.5 6.5 0 0 0 4.5 17.5 V19.5" {...line(color)} />
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

export function ChevronDownIcon({ size = 16, color = feed.text }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Path d="M6 9.5l6 6 6-6" {...line(color)} strokeWidth={2.4} />
    </Svg>
  );
}

export function CheckMarkIcon({ size = 18, color = feed.text }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Path d="M5 12.5l4.5 4.5L19 7.5" {...line(color)} strokeWidth={2.4} />
    </Svg>
  );
}
