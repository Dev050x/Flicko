import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Rect } from "react-native-svg";

import { Button, TextButton } from "@/components/ui/button";
import { useLastShot } from "@/features/camera/last-shot";
import {
  detectFacesDetailed,
  faceDetectionAvailable,
  type Detection,
} from "@/features/face";
import { colors, ref, type } from "@/theme";

/*
 * Dev-only check of still-photo face detection: runs detectFaces on the last camera
 * shot and draws every landmark and the face box. The first run includes loading the
 * model; "Run again" shows the warm timing (target < 300ms).
 */
export default function DevFace() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const uri = useLastShot((s) => s.uri);
  const [result, setResult] = useState<Detection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [runs, setRuns] = useState<number[]>([]);

  const run = useCallback(async () => {
    if (!uri) return;
    setBusy(true);
    setError(null);
    try {
      const detection = await detectFacesDetailed(uri);
      setResult(detection);
      if (detection) setRuns((r) => [...r, detection.totalMs]);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }, [uri]);

  useEffect(() => {
    run();
  }, [run]);

  const width = screenWidth - 32;
  const height = result ? (width * result.height) / result.width : width * (16 / 9);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        padding: 16,
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 32,
        gap: 12,
      }}
    >
      <Text style={[type.h1, { color: colors.text }]}>Face detection</Text>
      {!faceDetectionAvailable && (
        <Text style={styles.note}>
          The face module isn't in this build. Make a new development build.
        </Text>
      )}
      {!uri && (
        <Text style={styles.note}>
          Take a photo on the camera first; this screen uses the last shot.
        </Text>
      )}
      {uri && (
        <View style={{ width, height }}>
          <Image source={{ uri }} style={{ width, height }} contentFit="fill" />
          {result && (
            <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
              {result.faces.map((face, f) => (
                <Rect
                  key={`box${f}`}
                  x={face.box.x * width}
                  y={face.box.y * height}
                  width={face.box.width * width}
                  height={face.box.height * height}
                  fill="none"
                  stroke={colors.accent}
                  strokeWidth={2}
                />
              ))}
              {result.faces.flatMap((face, f) =>
                face.landmarks.map((p, i) => (
                  <Circle
                    key={`${f}-${i}`}
                    cx={p.x * width}
                    cy={p.y * height}
                    r={1.2}
                    fill={ref.check}
                  />
                )),
              )}
            </Svg>
          )}
        </View>
      )}
      {result && (
        <Text style={styles.stats}>
          {result.faces.length} face(s) · {result.totalMs}ms total (decode{" "}
          {result.decodeMs}ms) · {result.delegate} · {result.width}×{result.height}
          {runs.length > 1 ? `\nruns: ${runs.join(", ")}ms` : ""}
          {result.faces[0]
            ? `\nlandmarks ${result.faces[0].landmarks.length} · matrix ${result.faces[0].matrix.length} · blendshapes ${Object.keys(result.faces[0].blendshapes).length}`
            : ""}
        </Text>
      )}
      {error && <Text style={[styles.stats, { color: colors.loss }]}>{error}</Text>}
      <Button label={busy ? "Detecting…" : "Run again"} disabled={busy || !uri} onPress={run} />
      <TextButton label="Back" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  note: { fontFamily: "DMSans_400Regular", fontSize: 15, color: ref.textSoft },
  stats: { fontFamily: "DMSans_500Medium", fontSize: 13, color: ref.textBright },
});
