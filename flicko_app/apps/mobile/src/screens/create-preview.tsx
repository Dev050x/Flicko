import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import {
  Alert,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SceneCanvas, useSceneAssets } from "@/components/create/scene-canvas";
import { Glass } from "@/components/ui/glass";
import { GlassButton } from "@/components/ui/glass-button";
import {
  AdjustIcon,
  ArrowRightIcon,
  CloseIcon,
  CropIcon,
  DownloadIcon,
  StickerIcon,
} from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { flatten } from "@/features/create/render";
import { sceneAspect } from "@/features/create/scene";
import { useCreateStore } from "@/features/create/store";
import { fitIn, useScene } from "@/features/create/use-scene";
import { mediaLibrary } from "@/lib/native";
import { cam, colors } from "@/theme";

/*
 * 1 · Preview (design-reference/CreateFlow.html): the snap full screen with ✕ and Save
 * on top, the quick-edit rail on the right (each opens Edit on that tool), Retake and
 * Next at the bottom. `notice` is a toast from the camera (e.g. no face found).
 */
type Tool = "text" | "stickers" | "adjust" | "crop";

const LEAVE_MS = 400;

const RAIL: { tool: Tool; label: string; icon: ReactNode }[] = [
  { tool: "text", label: "Text", icon: <Text style={{ fontFamily: "DMSans_700Bold", fontSize: 17, color: colors.text }}>Aa</Text> },
  { tool: "stickers", label: "Stickers", icon: <StickerIcon /> },
  { tool: "adjust", label: "Adjust", icon: <AdjustIcon /> },
  { tool: "crop", label: "Crop", icon: <CropIcon /> },
];

export default function CreatePreview() {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const scene = useScene();
  const assets = useSceneAssets(scene);
  const reset = useCreateStore((s) => s.reset);
  const [saving, setSaving] = useState(false);
  const [pressed, setPressed] = useState(false);
  const { toast, show } = useToast(insets.top + 64);

  useEffect(() => {
    if (notice) show(notice);
  }, [notice, show]);


  // Back to the camera; the store is cleared once this screen has gone.
  const leave = useCallback(() => {
    router.back();
    setTimeout(reset, LEAVE_MS);
  }, [reset]);

  const discard = useCallback(() => {
    Alert.alert("Discard this snap?", "Your edits will be lost.", [
      { text: "Keep editing", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: leave,
      },
    ]);
  }, [leave]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        discard();
        return true;
      });
      return () => sub.remove();
    }, [discard]),
  );

  const save = async () => {
    if (!scene || saving) return;
    const library = mediaLibrary();
    if (!library) {
      show("Saving needs a new app build");
      return;
    }
    setSaving(true);
    try {
      const permission = await library.requestPermissionsAsync(true);
      if (!permission.granted) {
        show("Allow photo access to save");
        return;
      }
      const image = await flatten(scene);
      await library.saveToLibraryAsync(image.uri);
      show("Saved");
    } catch (err) {
      console.warn("[create] save failed", err);
      show("Couldn't save the photo");
    } finally {
      setSaving(false);
    }
  };

  const size = scene
    ? fitIn(sceneAspect(scene), { width: window.width, height: window.height })
    : { width: 0, height: 0 };

  return (
    <View style={styles.screen}>
      {scene && (
        <View style={styles.photo}>
          <SceneCanvas
            scene={scene}
            assets={assets}
            width={size.width}
            height={size.height}
          />
        </View>
      )}

      <GlassButton
        label="Discard"
        style={{ top: insets.top + 12, left: 16 }}
        onPress={discard}
      >
        <CloseIcon />
      </GlassButton>
      <GlassButton
        label="Save to gallery"
        style={{ top: insets.top + 12, right: 16, opacity: saving ? 0.5 : 1 }}
        onPress={save}
      >
        <DownloadIcon />
      </GlassButton>

      <View style={[styles.rail, { top: insets.top + 76 }]}>
        {RAIL.map(({ tool, label, icon }) => (
          <GlassButton
            key={tool}
            label={label}
            onPress={() =>
              router.push({ pathname: "/create/edit", params: { tool } })
            }
          >
            {icon}
          </GlassButton>
        ))}
      </View>

      <View style={[styles.bottom, { bottom: insets.bottom + 36 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retake"
          onPress={leave}
        >
          <Glass style={styles.retake}>
            <Text style={styles.actionText}>Retake</Text>
          </Glass>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next"
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
          onPress={() => router.push("/create/caption")}
          style={[
            styles.next,
            { backgroundColor: pressed ? colors.accentPressed : colors.accent },
          ]}
        >
          <ArrowRightIcon />
          <Text style={styles.actionText}>Next</Text>
        </Pressable>
      </View>
      {toast}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000000" },
  photo: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  rail: { position: "absolute", right: 16, gap: 12 },
  bottom: {
    position: "absolute",
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  retake: {
    height: 52,
    borderRadius: 26,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
    borderColor: cam.glassBorder,
  },
  next: {
    width: 150,
    height: 52,
    borderRadius: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  actionText: { fontFamily: "DMSans_700Bold", fontSize: 16, color: colors.text },
});
