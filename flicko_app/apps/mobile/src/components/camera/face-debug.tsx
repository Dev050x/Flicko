import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import {
  hudLast,
  hudPlacementText,
  useFaceHudSwitch,
  useLiveEyes,
} from "@/features/face";
import { frameToView, type Pt } from "@/features/face/mapping";
import type { Rect } from "@/features/filters/placement";

const MEDIAPIPE = "#3DF5C4";
const MLKIT = "#FFB21A";

interface Drawn {
  points: string;
  mpEyes: Pt[];
  mlEyes: Pt[];
  text: string;
}

/*
 * Dev overlay (HUD on): the 478 MediaPipe points and both detectors' eye centres on the
 * preview, MediaPipe in green and ML Kit in orange, so alignment can be judged by eye.
 */
export function FaceDebug({ view }: { view: Rect | null }) {
  const on = useFaceHudSwitch((s) => s.debug);
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  const overlayEyes = useLiveEyes((s) => s.eyes);

  useEffect(() => {
    if (!__DEV__ || !on || !view) {
      setDrawn(null);
      return;
    }
    const timer = setInterval(() => {
      const mp = hudLast("mediapipe");
      const ml = hudLast("mlkit");
      const eyes = (r: typeof mp) =>
        r
          ? r.faces.flatMap((f) => [
              frameToView(f.leftEye, r.frame, view),
              frameToView(f.rightEye, r.frame, view),
            ])
          : [];
      const points =
        mp?.faces[0]?.landmarks
          .map((p) => {
            const q = frameToView(p, mp.frame, view);
            return `M${q.x.toFixed(1)} ${q.y.toFixed(1)}h0.1`;
          })
          .join("") ?? "";
      setDrawn({
        points,
        mpEyes: eyes(mp),
        mlEyes: eyes(ml),
        text: hudPlacementText,
      });
    }, 200);
    return () => clearInterval(timer);
  }, [on, view]);

  if (!__DEV__ || !on || !view || !drawn) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Text style={styles.text}>{drawn.text}</Text>
      <Svg width={view.width} height={view.height}>
        {drawn.points !== "" && (
          <Path
            d={drawn.points}
            stroke={MEDIAPIPE}
            strokeWidth={2.5}
            strokeLinecap="round"
            opacity={0.7}
          />
        )}
        {drawn.mlEyes.map((p, i) => (
          <Circle
            key={`l${i}`}
            cx={p.x}
            cy={p.y}
            r={7}
            stroke={MLKIT}
            strokeWidth={2.5}
            fill="none"
          />
        ))}
        {overlayEyes.flatMap((e, i) =>
          [e.left, e.right].map((p, j) => (
            <Circle
              key={`o${i}${j}`}
              cx={p.x}
              cy={p.y}
              r={12}
              stroke="#FF2D95"
              strokeWidth={2.5}
              fill="none"
            />
          )),
        )}
        {drawn.mpEyes.map((p, i) => (
          <Circle key={`m${i}`} cx={p.x} cy={p.y} r={3.5} fill={MEDIAPIPE} />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  text: {
    position: "absolute",
    left: 8,
    right: 8,
    top: 395,
    zIndex: 5,
    padding: 4,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.65)",
    fontFamily: "GeistMono_400Regular",
    fontSize: 10,
    color: "#FF2D95",
  },
});
