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

/*
 * "No filter": a thin circle with a diagonal slash.
 */
export function NoFilterIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Line size={size} color={color} width={1.6}>
      <Circle cx={12} cy={12} r={8} />
      <Path d="M6.4 17.6 L17.6 6.4" />
    </Line>
  );
}

/*
 * Create flow (design-reference/CreateFlow.html).
 */
export function CloseIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <Line size={size} color={color}>
      <Path d="M6 6 L18 18 M18 6 L6 18" />
    </Line>
  );
}

export function DownloadIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <Line size={size} color={color}>
      <Path d="M12 4 V15 M7 10 L12 15 L17 10" />
      <Path d="M5 19 H19" />
    </Line>
  );
}

export function StickerIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <Line size={size} color={color}>
      <Circle cx={12} cy={12} r={8.5} />
      <Circle cx={9} cy={10} r={0.8} />
      <Circle cx={15} cy={10} r={0.8} />
      <Path d="M8.5 14.5 Q12 17.5 15.5 14.5" />
    </Line>
  );
}

export function AdjustIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <Line size={size} color={color}>
      <Path d="M5 7 H19 M5 17 H19" />
      <Circle cx={9} cy={7} r={2.2} />
      <Circle cx={15} cy={17} r={2.2} />
    </Line>
  );
}

export function CropIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <Line size={size} color={color}>
      <Path d="M7 3 V17 H21" />
      <Path d="M3 7 H17 V21" />
    </Line>
  );
}

export function DrawIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <Line size={size} color={color}>
      <Path d="M4 20 L8 19 L19 8 L16 5 L5 16 Z" />
    </Line>
  );
}

export function FiltersIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <Line size={size} color={color}>
      <Path d="M4 20 L14 10" />
      <Path d="M16 3 V6 M14.5 4.5 H17.5 M20 8 V10 M19 9 H21" />
    </Line>
  );
}

export function ArrowRightIcon({ size = 20, color = colors.text }: IconProps) {
  return (
    <Line size={size} color={color}>
      <Path d="M5 12 H19 M13 6 L19 12 L13 18" />
    </Line>
  );
}

export function ShareIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <Line size={size} color={color}>
      <Path d="M12 15 V4 M7 9 L12 4 L17 9" />
      <Path d="M5 14 V19 H19 V14" />
    </Line>
  );
}

export function UndoIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <Line size={size} color={color}>
      <Path d="M9 14 L4 9 L9 4" />
      <Path d="M4 9 H15 A5 5 0 0 1 15 19 H11" />
    </Line>
  );
}

export function RedoIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <Line size={size} color={color}>
      <Path d="M15 14 L20 9 L15 4" />
      <Path d="M20 9 H9 A5 5 0 0 0 9 19 H13" />
    </Line>
  );
}

export function RotateIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <Line size={size} color={color}>
      <Path d="M20 11 A8 8 0 1 0 17.7 17.7" />
      <Path d="M20 4 V11 H13" />
    </Line>
  );
}

export function MirrorIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <Line size={size} color={color}>
      <Path d="M12 3 V21" />
      <Path d="M8 7 L3 17 H8 Z" />
      <Path d="M16 7 L21 17 H16 Z" />
    </Line>
  );
}

export function GalleryIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <Line size={size} color={color}>
      <Rect x={3.5} y={4.5} width={17} height={15} rx={2.5} />
      <Circle cx={9} cy={10} r={1.6} />
      <Path d="M4 17 L9.5 12.5 L13 15.5 L16 13 L20 16.5" />
    </Line>
  );
}

export function ShuffleIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <Line size={size} color={color}>
      <Path d="M3 7 H7 C11 7 13 17 17 17 H21" />
      <Path d="M3 17 H7 C9 17 10.2 14.6 11.2 12.4" />
      <Path d="M13 9.4 C14 8 15.2 7 17 7 H21" />
      <Path d="M18 4 L21 7 L18 10" />
      <Path d="M18 14 L21 17 L18 20" />
    </Line>
  );
}
