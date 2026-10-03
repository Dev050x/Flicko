import type React from "react";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";

import { colors, ref } from "@/theme";

/*
 * Line icons copied from the reference designs (24x24 viewBox).
 */
type IconProps = { size?: number; color?: string };

export function WalletIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <G
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Path d="M3 7.5 A2.5 2.5 0 0 1 5.5 5 H18 V9" />
        <Path d="M3 7.5 V17 A2 2 0 0 0 5 19 H20 V9 H5.5 A2.5 2.5 0 0 1 3 7.5" />
        <Circle cx={16} cy={14} r={1.3} fill={color} />
      </G>
    </Svg>
  );
}

export function CheckIcon({ size = 14, color = ref.check }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Path
        d="M5 12.5 L10 17.5 L19 7"
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ChevronLeftIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Path
        d="M15 5 L8 12 L15 19"
        fill="none"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function CameraIcon({ size = 34, color = colors.text }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <G
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Path d="M4 8 H7.5 L9 6 H15 L16.5 8 H20 V18 H4 Z" />
        <Circle cx={12} cy={13} r={3.4} />
      </G>
    </Svg>
  );
}

export function RefreshIcon({ size = 30, color = ref.textBright }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <G
        fill="none"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Path d="M20 11 A8 8 0 1 0 17.6 17" />
        <Path d="M20 4 V11 H13" />
      </G>
    </Svg>
  );
}

export function SealIcon({ size = 18 }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Path
        d="M12 2 L14.6 4.4 L18 4 L18.6 7.4 L21.6 9.2 L20 12 L21.6 14.8 L18.6 16.6 L18 20 L14.6 19.6 L12 22 L9.4 19.6 L6 20 L5.4 16.6 L2.4 14.8 L4 12 L2.4 9.2 L5.4 7.4 L6 4 L9.4 4.4 Z"
        fill={ref.check}
      />
      <Path
        d="M8 12.2 L10.8 15 L16 9.6"
        fill="none"
        stroke={colors.bg}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/*
 * Viewfinder corners (100x100 viewBox) used by the permission illustration.
 */
export function ViewfinderIcon({ size = 240, color = colors.text }: IconProps) {
  return (
    <Svg viewBox="0 0 100 100" width={size} height={size}>
      <Path
        fill="none"
        stroke={color}
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 24 V12 Q4 4 12 4 H24 M76 4 H88 Q96 4 96 12 V24 M4 76 V88 Q4 96 12 96 H24 M96 76 V88 Q96 96 88 96 H76"
      />
    </Svg>
  );
}

/*
 * Camera home icons (design-reference/Camera.html).
 */
function Line({
  size,
  color,
  width = 2,
  children,
}: IconProps & { width?: number; children: React.ReactNode }) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <G
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </G>
    </Svg>
  );
}

export function FlipIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <Line size={size} color={color}>
      <Path d="M4 9 A8 8 0 0 1 18.5 6.5" />
      <Path d="M19 3 V7 H15" />
      <Path d="M20 15 A8 8 0 0 1 5.5 17.5" />
      <Path d="M5 21 V17 H9" />
    </Line>
  );
}

export function FlashIcon({
  size = 22,
  color = colors.text,
  off = false,
}: IconProps & { off?: boolean }) {
  return (
    <Line size={size} color={color}>
      <Path d="M13 3 L5 13.5 H11.5 L10.5 21 L19 10 H12.5 Z" />
      {off && <Path d="M4 4 L20 20" />}
    </Line>
  );
}

export function TimerIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <Line size={size} color={color}>
      <Circle cx={12} cy={13.5} r={7.5} />
      <Path d="M12 9.5 V13.5 L14.5 15.5" />
      <Path d="M9.5 3 H14.5" />
    </Line>
  );
}

export function LockIcon({ size = 13, color = colors.text }: IconProps) {
  return (
    <Line size={size} color={color} width={2.4}>
      <Rect x={5} y={11} width={14} height={9} rx={2} />
      <Path d="M8 11 V8 A4 4 0 0 1 16 8 V11" />
    </Line>
  );
}

export function MarketsIcon({ size = 26, color = colors.text }: IconProps) {
  return (
    <Line size={size} color={color}>
      <Path d="M3 17 L9 11 L13 15 L21 7" />
      <Path d="M15 7 H21 V13" />
    </Line>
  );
}

export function FeedIcon({ size = 26, color = colors.text }: IconProps) {
  return (
    <Line size={size} color={color}>
      <Rect x={5} y={3} width={14} height={18} rx={3} />
      <Path d="M10.5 9.5 L14.5 12 L10.5 14.5 Z" />
    </Line>
  );
}
