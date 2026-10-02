import { View } from "react-native";
import Svg, { G, Path, Rect } from "react-native-svg";

import {
  CORNER_STROKE,
  cornersPath,
  GLYPH_STROKE,
  glyphPath,
  TILE_RADIUS,
} from "@/brand/logo";
import { BrandDefs } from "./brand-defs";

/*
 * Pink drop shadow under the tile, as in the splash and lockup designs.
 */
export const TILE_SHADOW = "0px 18px 50px rgba(255, 45, 149, 0.30)";

/*
 * The app icon: gradient tile, highlight, viewfinder corners and the "f" arrow.
 */
export function LogoTile({
  size,
  shadow = false,
}: {
  size: number;
  shadow?: boolean;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * (TILE_RADIUS / 100),
        boxShadow: shadow ? TILE_SHADOW : undefined,
      }}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <BrandDefs />
        <TileFill />
        <G
          fill="none"
          stroke="#fff"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path strokeWidth={CORNER_STROKE} d={cornersPath} />
          <Path strokeWidth={GLYPH_STROKE} d={glyphPath} />
        </G>
      </Svg>
    </View>
  );
}

/*
 * Tile background; needs <BrandDefs /> in the same Svg.
 */
export function TileFill() {
  return (
    <>
      <Rect width={100} height={100} rx={TILE_RADIUS} fill="url(#brand)" />
      <Rect width={100} height={100} rx={TILE_RADIUS} fill="url(#shine)" />
    </>
  );
}
