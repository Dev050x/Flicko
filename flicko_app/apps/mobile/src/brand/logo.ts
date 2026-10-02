/*
 * Logo geometry and colours from the brand design files. Paths use a 100x100 viewBox;
 * this file has no React Native imports so the asset script can use it too.
 */
export const colors = {
  bg: "#0E0B14",
  violet: "#5B2BFF",
  pink: "#FF2D95",
  amber: "#FFB21A",
} as const;

/*
 * The brand gradient runs bottom-left to top-right (CSS linear-gradient 45deg).
 */
export const gradientStops = [
  { offset: 0, color: colors.violet },
  { offset: 0.55, color: colors.pink },
  { offset: 1, color: colors.amber },
] as const;

/*
 * Solid brand colours of the viewfinder corners while the intro focuses, following the
 * gradient direction: top-left, top-right, bottom-left, bottom-right.
 */
export const focusColors = [
  colors.pink,
  colors.amber,
  colors.violet,
  colors.pink,
] as const;

/*
 * Tile corner radius is 22.5% of its size; the highlight is a white radial at (78%, 18%)
 * fading out at 42% of the farthest-corner distance.
 */
export const TILE_RADIUS = 22.5;
export const HIGHLIGHT = { cx: 78, cy: 18, r: 47.5, opacity: 0.28 } as const;

export const CORNER_STROKE = 6;
export const GLYPH_STROKE = 9;

export const cornersPath =
  "M16 34 V24 Q16 16 24 16 H34 M66 16 H76 Q84 16 84 24 V34 M16 66 V76 Q16 84 24 84 H34 M84 66 V76 Q84 84 76 84 H66";

/*
 * The "f" is split so the intro can draw it: stem curving into the arrow shaft, crossbar, arrow head.
 */
export const stemPath = "M44 72 V50 C44 38 54 34 64 27";
export const crossbarPath = "M35 51 H55";
export const headPath = "M55 26.2 L64 27 L61.7 35.7";
export const glyphPath = `${stemPath} ${crossbarPath} ${headPath}`;

/*
 * The "f" drawn up to fraction `f` (0..1) of its length, so the intro can grow each stroke
 * by animating `d` (stroke-dash animation does not render on Android).
 */
const lerp = (a: number, b: number, t: number) => {
  "worklet";
  return a + (b - a) * t;
};

/*
 * Stem: 22 units straight up from (44,72), then the curve (44,50) (44,38) (54,34) (64,27),
 * about 32 units long, cut at curve parameter `s` with de Casteljau.
 */
const STEM_LINE = 22;
const STEM_TOTAL = 54;
export const partialStem = (f: number) => {
  "worklet";
  const length = f * STEM_TOTAL;
  if (length <= STEM_LINE) return `M44 72 V${72 - length}`;
  const s = Math.min(1, (length - STEM_LINE) / (STEM_TOTAL - STEM_LINE));
  const ax = 44;
  const ay = lerp(50, 38, s);
  const bx = lerp(44, 54, s);
  const by = lerp(38, 34, s);
  const cx = lerp(54, 64, s);
  const cy = lerp(34, 27, s);
  const dx = lerp(ax, bx, s);
  const dy = lerp(ay, by, s);
  const ex = lerp(bx, cx, s);
  const ey = lerp(by, cy, s);
  return `M44 72 V50 C${ax} ${ay} ${dx} ${dy} ${lerp(dx, ex, s)} ${lerp(dy, ey, s)}`;
};

export const partialCrossbar = (f: number) => {
  "worklet";
  return `M35 51 H${35 + 20 * f}`;
};

/*
 * Arrow head: (55,26.2) to the tip (64,27), then down to (61.7,35.7); two ~9 unit strokes.
 */
export const partialHead = (f: number) => {
  "worklet";
  if (f <= 0.5) {
    const t = f * 2;
    return `M55 26.2 L${lerp(55, 64, t)} ${lerp(26.2, 27, t)}`;
  }
  const t = (f - 0.5) * 2;
  return `M55 26.2 L64 27 L${lerp(64, 61.7, t)} ${lerp(27, 35.7, t)}`;
};

/*
 * One viewfinder corner bracket (0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right).
 * `inset` is the distance from the viewBox edge, `arm` the bracket length and `radius`
 * its rounded corner. The locked logo is inset 16, arm 18, radius 8.
 */
export const bracketPath = (
  corner: number,
  inset: number,
  arm: number,
  radius: number,
) => {
  "worklet";
  const a = inset;
  const b = 100 - inset;
  switch (corner) {
    case 0:
      return `M${a} ${a + arm} V${a + radius} Q${a} ${a} ${a + radius} ${a} H${a + arm}`;
    case 1:
      return `M${b - arm} ${a} H${b - radius} Q${b} ${a} ${b} ${a + radius} V${a + arm}`;
    case 2:
      return `M${a} ${b - arm} V${b - radius} Q${a} ${b} ${a + radius} ${b} H${a + arm}`;
    default:
      return `M${b} ${b - arm} V${b - radius} Q${b} ${b} ${b - radius} ${b} H${b - arm}`;
  }
};

export const bracketsPath = (inset: number, arm: number, radius: number) => {
  "worklet";
  return [0, 1, 2, 3].map((c) => bracketPath(c, inset, arm, radius)).join(" ");
};
