import { StyleSheet, Text, View } from "react-native";

import { useFaceHud } from "@/features/face";

/* Dev-only readout over the camera (switch it on from /dev/screens). */
export function FaceHud({ top }: { top: number }) {
  const hud = useFaceHud();
  if (!__DEV__ || !hud) return null;
  const ms = (n: number | null) => (n === null ? "–" : `${n.toFixed(0)}ms`);
  return (
    <View pointerEvents="none" style={[styles.box, { top }]}>
      <Text style={styles.text}>
        source {hud.source} · faces {hud.faces}
      </Text>
      <Text style={styles.text}>
        preview {hud.previewFps} fps · tracking {hud.trackingFps} fps
      </Text>
      <Text style={styles.text}>
        inference {ms(hud.medianMs)} median · {ms(hud.p95Ms)} p95
        {hud.prepMs !== null ? ` · prep ${ms(hud.prepMs)}` : ""}
      </Text>
      <Text style={styles.text}>
        dropped{" "}
        {hud.droppedPct === null ? "–" : `${hud.droppedPct.toFixed(0)}%`}
        {hud.delegate
          ? ` · MediaPipe ${hud.delegate} · stalls ${hud.stalls}`
          : ""}
      </Text>
      <Text style={styles.text}>
        lag p95: queue {ms(hud.queueMs)} · render {ms(hud.renderMs)}
      </Text>
      <Text style={styles.text}>frame {hud.frame}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: "absolute",
    left: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    gap: 2,
  },
  text: { fontFamily: "GeistMono_400Regular", fontSize: 11, color: "#C8FF4D" },
});
