import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

import type { Filter } from "@/features/filters/catalog";
import {
  approxEyes,
  placementsFor,
  type Rect,
} from "@/features/filters/placement";

/*
 * What sits on the live preview: the selected filter's art (face overlays at the rough
 * eye position, frames and stickers on the area the chosen aspect keeps). No crop
 * outline is drawn; the aspect only decides the crop of the captured photo.
 */
export function LiveOverlay({
  filter,
  view,
  crop,
}: {
  filter: Filter;
  view: Rect;
  crop: Rect;
}) {
  const placements = placementsFor(filter, crop, approxEyes(view));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {placements.map((p, i) => (
        <Image
          key={i}
          source={p.source}
          contentFit="fill"
          style={{
            position: "absolute",
            left: p.x - p.anchorX * p.width,
            top: p.y - p.anchorY * p.height,
            width: p.width,
            height: p.height,
            transformOrigin: `${p.anchorX * 100}% ${p.anchorY * 100}% 0`,
            transform: p.steps.map((s) =>
              "mirror" in s ? { scaleX: -1 } : { rotate: `${s.rotate}deg` },
            ),
          }}
        />
      ))}
    </View>
  );
}

