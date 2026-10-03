import type React from "react";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";

import { colors } from "@/theme";

/*
 * Line icons from the markets kit references (24 viewBox, round caps).
 */
type IconProps = { size?: number; color?: string };

function Line({
  size,
  color,
  width = 2,
  fill = "none",
  children,
}: {
  size: number;
  color: string;
  width?: number;
  fill?: string;
  children: React.ReactNode;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G fill={fill} stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </G>
    </Svg>
  );
}

// star-outline.svg / star-filled.svg (same path; the filled one also fills)
const STAR = "M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9z";

export function StarIcon({
  size = 22,
  color = colors.text,
  filled = false,
  width = 2,
}: IconProps & { filled?: boolean; width?: number }) {
  return (
    <Line size={size} color={color} width={width} fill={filled ? color : "none"}>
      <Path d={STAR} />
    </Line>
  );
}

export function SearchIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <Line size={size} color={color}>
      <Circle cx={11} cy={11} r={6.5} />
      <Path d="M16 16 L20 20" />
    </Line>
  );
}

export function ChevronDownIcon({ size = 14, color = colors.text }: IconProps) {
  return (
    <Line size={size} color={color} width={2.4}>
      <Path d="M7 10 L12 15 L17 10" />
    </Line>
  );
}

export function BackIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Line size={size} color={color} width={2.4}>
      <Path d="M15 5 L8 12 L15 19" />
    </Line>
  );
}

export function MoreIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={5} cy={12} r={1.8} fill={color} />
      <Circle cx={12} cy={12} r={1.8} fill={color} />
      <Circle cx={19} cy={12} r={1.8} fill={color} />
    </Svg>
  );
}

export function ShareArrowIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <Line size={size} color={color}>
      <Path d="M14 4.5 L20.5 11 L14 17.5" />
      <Path d="M20.5 11 H11 A6.5 6.5 0 0 0 4.5 17.5 V19.5" />
    </Line>
  );
}

export function CopyIcon({ size = 14, color = colors.textMuted }: IconProps) {
  return (
    <Line size={size} color={color}>
      <Rect x={8} y={8} width={12} height={12} rx={2} />
      <Path d="M16 8 V6 A2 2 0 0 0 14 4 H6 A2 2 0 0 0 4 6 V14 A2 2 0 0 0 6 16 H8" />
    </Line>
  );
}

export function ExternalIcon({ size = 14, color = colors.textMuted }: IconProps) {
  return (
    <Line size={size} color={color}>
      <Path d="M14 4 H20 V10" />
      <Path d="M20 4 L11 13" />
      <Path d="M18 14 V19 A1 1 0 0 1 17 20 H5 A1 1 0 0 1 4 19 V7 A1 1 0 0 1 5 6 H10" />
    </Line>
  );
}

export function BellIcon({ size = 18, color = colors.text }: IconProps) {
  return (
    <Line size={size} color={color}>
      <Path d="M6 16 V11 A6 6 0 0 1 18 11 V16 L19.5 18 H4.5 Z" />
      <Path d="M10 20.5 H14" />
    </Line>
  );
}

export function CheckIcon({ size = 16, color = colors.text }: IconProps) {
  return (
    <Line size={size} color={color} width={2.6}>
      <Path d="M5 12.5 L10 17.5 L19 7" />
    </Line>
  );
}

export function WarningIcon({ size = 16, color = colors.loss }: IconProps) {
  return (
    <Line size={size} color={color} width={2.2}>
      <Path d="M12 4 L21 19.5 H3 Z" />
      <Path d="M12 10 V14" />
      <Path d="M12 17 V17.2" />
    </Line>
  );
}

export function ArrowUpIcon({ size = 16, color = colors.gain }: IconProps) {
  return (
    <Line size={size} color={color} width={2.4}>
      <Path d="M12 18 V6 M7 11 L12 6 L17 11" />
    </Line>
  );
}

export function ArrowDownIcon({ size = 16, color = colors.loss }: IconProps) {
  return (
    <Line size={size} color={color} width={2.4}>
      <Path d="M12 6 V18 M7 13 L12 18 L17 13" />
    </Line>
  );
}

export function FlagIcon({ size = 18, color = colors.text }: IconProps) {
  return (
    <Line size={size} color={color}>
      <Path d="M5 21 V4" />
      <Path d="M5 4 H17 L14.5 8 L17 12 H5" />
    </Line>
  );
}
