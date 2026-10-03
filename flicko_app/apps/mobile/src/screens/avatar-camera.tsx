import type { CameraView as CameraViewType } from "expo-camera";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, TextButton } from "@/components/ui/button";
import { camera } from "@/lib/native";
import { useSession } from "@/store/session";
import { colors, ref, type } from "@/theme";

/*
 * In-app camera for the profile picture (front camera by default). The photo is kept on
 * the device for now; the server has no avatar field yet.
 */
export default function AvatarCamera() {
  const expoCamera = camera();
  if (!expoCamera) {
    return (
      <Notice
        title="Camera needs a new build"
        body="This build of Flicko was made before the camera was added. Install a new development build to snap your profile pic."
      />
    );
  }
  return <Capture module={expoCamera} />;
}

function Capture({ module }: { module: typeof import("expo-camera") }) {
  const { CameraView, useCameraPermissions } = module;
  const insets = useSafeAreaInsets();
  const setAvatar = useSession((s) => s.setAvatar);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<"front" | "back">("front");
  const [busy, setBusy] = useState(false);
  const shot = useRef<CameraViewType>(null);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const snap = async () => {
    if (!shot.current || busy) return;
    setBusy(true);
    try {
      const photo = await shot.current.takePictureAsync({ quality: 0.7 });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      if (photo?.uri) setAvatar(photo.uri);
      router.back();
    } finally {
      setBusy(false);
    }
  };

  if (!permission?.granted) {
    return (
      <Notice
        title="Camera access is off"
        body="Allow the camera to snap your profile pic. You can change this in Settings."
        action={{ label: "Allow camera", onPress: requestPermission }}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <CameraView ref={shot} style={StyleSheet.absoluteFill} facing={facing} />
      <View style={[styles.controls, { bottom: 32 + insets.bottom }]}>
        <TextButton label="Cancel" onPress={() => router.back()} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Take photo"
          onPress={snap}
          style={styles.shutter}
        >
          <View style={styles.shutterInner} />
        </Pressable>
        <TextButton
          label="Flip"
          onPress={() => setFacing((f) => (f === "front" ? "back" : "front"))}
        />
      </View>
    </View>
  );
}

function Notice({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={[styles.screen, styles.center, { padding: 24 }]}>
      <Text
        style={[type.sheetTitle, { color: colors.text, textAlign: "center" }]}
      >
        {title}
      </Text>
      <Text style={styles.body}>{body}</Text>
      <View style={{ alignSelf: "stretch", gap: 4, marginTop: 16 }}>
        {action && <Button label={action.label} onPress={action.onPress} />}
        <TextButton label="Not now" onPress={() => router.back()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center", gap: 8 },
  body: {
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    lineHeight: 22,
    color: ref.textSoft,
    textAlign: "center",
  },
  controls: {
    position: "absolute",
    left: 24,
    right: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: colors.text,
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.text,
  },
});
