import { Defs, LinearGradient, RadialGradient, Stop } from "react-native-svg";

import { gradientStops, HIGHLIGHT } from "@/brand/logo";

/*
 * Shared SVG defs for a 100x100 viewBox: `brand` is the 45deg gradient, `shine` the top-right highlight.
 */
export function BrandDefs() {
  return (
    <Defs>
      <LinearGradient
        id="brand"
        x1="0"
        y1="100"
        x2="100"
        y2="0"
        gradientUnits="userSpaceOnUse"
      >
        {gradientStops.map((stop) => (
          <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
        ))}
      </LinearGradient>
      <RadialGradient
        id="shine"
        cx={HIGHLIGHT.cx}
        cy={HIGHLIGHT.cy}
        r={HIGHLIGHT.r}
        gradientUnits="userSpaceOnUse"
      >
        <Stop offset={0} stopColor="#fff" stopOpacity={HIGHLIGHT.opacity} />
        <Stop offset={1} stopColor="#fff" stopOpacity={0} />
      </RadialGradient>
    </Defs>
  );
}
