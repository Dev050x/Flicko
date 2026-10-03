import { memo } from "react";
import { View } from "react-native";
import Svg, { Rect } from "react-native-svg";

/*
 * A small round identicon from a wallet address: a hue from the address and a 5×5
 * mirrored pattern, like GitHub's. Same address, same picture.
 */
const hash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export const Identicon = memo(function Identicon({
  address,
  size = 16,
}: {
  address: string;
  size?: number;
}) {
  const h = hash(address);
  const hue = h % 360;
  const cell = size / 5;
  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      if ((h >>> ((y * 3 + x) % 31)) & 1) {
        cells.push({ x, y });
        if (x < 2) cells.push({ x: 4 - x, y });
      }
    }
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        backgroundColor: `hsl(${hue}, 35%, 24%)`,
      }}
    >
      <Svg width={size} height={size}>
        {cells.map((c) => (
          <Rect
            key={`${c.x}-${c.y}`}
            x={c.x * cell}
            y={c.y * cell}
            width={cell}
            height={cell}
            fill={`hsl(${hue}, 70%, 66%)`}
          />
        ))}
      </Svg>
    </View>
  );
});
