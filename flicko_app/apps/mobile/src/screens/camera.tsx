import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router, useIsFocused } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Alert,
  AppState,
  Linking,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { CameraLayerRef } from "@/components/camera/camera-view";
import { CategoryChips } from "@/components/camera/category-chips";
import {
  FilterCarousel,
  SHUTTER,
  type FilterCarouselRef,
} from "@/components/camera/filter-carousel";
import { LiveOverlay } from "@/components/camera/live-overlay";
import { snapshotModelLayer } from "@/components/camera/model-overlay";
import { ToolRail } from "@/components/camera/tool-rail";
import { TopBar } from "@/components/camera/top-bar";
import { Button } from "@/components/ui/button";
import { Glass } from "@/components/ui/glass";
import { LockIcon } from "@/components/ui/icons";
import { ConnectFlow } from "@/components/wallet/connect-flow";
import { WalletSheet } from "@/components/wallet/wallet-sheet";
import { useLastShot } from "@/features/camera/last-shot";
import { useCameraSettings } from "@/features/camera/settings";
import { useCreateStore } from "@/features/create/store";
import { FILTERS, filterById, firstIndexOf } from "@/features/filters/catalog";
import { FaceDebug } from "@/components/camera/face-debug";
import { FaceHud } from "@/components/camera/face-hud";
import {
  useFaceFlags,
  useFaceTracking,
  useLiveEyes,
  type FaceTrackingResult,
} from "@/features/face";
import {
  approxEyes,
  defaultStickerPose,
  layoutFor,
  type Eyes,
  type Rect,
  type StickerPose,
} from "@/features/filters/placement";
import { isLocked, useUnlockedFilters } from "@/features/filters/unlocks";
import {
  audio,
  brightness,
  camera as expoCamera,
  hasCameraStack,
  hasSkia,
} from "@/lib/native";
import { colors, ref, type } from "@/theme";

const bobo = require("../../assets/characters/bobo-cheer.png");
const shutterSound = require("../../assets/sounds/shutter.wav");

/*
 * The camera is loaded only when this build has it: VisionCamera + Skia in a development
 * build, or the expo-camera fallback where VisionCamera is missing (Expo Go). Otherwise
 * the screen keeps its controls and shows a "new build needed" card.
 */
type CameraModule = typeof import("@/components/camera/camera-view");
const cameraModule: CameraModule | null = hasCameraStack()
  ? (require("@/components/camera/camera-view") as CameraModule)
  : expoCamera() && hasSkia()
    ? (require("@/components/camera/expo-camera-view") as CameraModule)
    : null;

const noPermission = () => ({
  hasPermission: false,
  canRequestPermission: false,
  requestPermission: async () => false,
});
const useCameraPermission = cameraModule?.useCameraPermission ?? noPermission;

/*
 * Positions from design-reference/Camera.html, measured up from the tab bar: shutter
 * centre 111, category chips 21. The filter label sits in the 60dp above the shutter
 * ring (carousel centre - 44 - 60).
 *
 * The photo is the whole preview (Snapchat style). Filter content (frames, stickers,
 * text) stays in the safe zone: below the avatar row (safe area + 110), above the label,
 * 16dp from the left and clear of the right rail (16dp + 56dp from the right).
 */
const SHUTTER_CENTER = 111;
const CHIPS_BOTTOM = 21;
const LABEL_HEIGHT = 60;
const ZONE_TOP = 110;
const ZONE_LEFT = 16;
const ZONE_RIGHT = 16 + 56;
const NAME_VISIBLE_MS = 1500;
const HINT_VISIBLE_MS = 3000;
const FADE_MS = 200;
const NO_FACE = "Couldn't find a face, placed it for you";
const HINT_HEIGHT = 28;

const FACE_HINT: Record<string, string> = {
  "laser-eyes": "Lasers lock onto your eyes after you snap",
};
const FIND_FACE_HINT = "Point the camera at a face";

/*
 * Live Skia filters switch off for the rest of the session once a device is too slow.
 */
let liveFiltersOff = false;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const appActive = useAppActive();
  const permission = useCameraPermission();
  const { facing, flash, timer, filterId, setFilter, restore } =
    useCameraSettings();
  const filter = filterById(filterId);
  const unlocked = useUnlockedFilters();

  const [view, setView] = useState<Rect | null>(null);
  const [live, setLive] = useState(!liveFiltersOff);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [screenFlash, setScreenFlash] = useState(false);
  const [sheet, setSheet] = useState<"wallet" | "connect" | null>(null);

  const camera = useRef<CameraLayerRef>(null);
  const carousel = useRef<FilterCarouselRef>(null);
  const initialIndex = useMemo(
    () => Math.max(0, FILTERS.indexOf(filter)),
    // Only where the list starts; later changes come from the list itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const player = useMemo(
    () => audio()?.createAudioPlayer(shutterSound) ?? null,
    [],
  );

  useEffect(() => {
    restore();
  }, [restore]);
  useEffect(() => () => player?.remove(), [player]);

  const labelTop = view
    ? view.height - SHUTTER_CENTER - SHUTTER / 2 - LABEL_HEIGHT
    : 0;
  const zone: Rect | null = view
    ? {
        x: ZONE_LEFT,
        y: insets.top + ZONE_TOP,
        width: view.width - ZONE_LEFT - ZONE_RIGHT,
        height: labelTop - (insets.top + ZONE_TOP),
      }
    : null;
  const ready = !!cameraModule && permission.hasPermission;

  // A sticker starts top-right of the safe zone and resets on a new filter.
  const [stickerPose, setStickerPose] = useState<StickerPose | null>(null);
  useEffect(() => setStickerPose(null), [filterId]);
  const sticker = stickerPose ?? (zone ? defaultStickerPose(zone) : null);

  // The filter name shows for 1.5s after a change, then fades; the premium chip stays.
  const nameOpacity = useSharedValue(0);
  // Face filters follow the eyes live when the camera can track them; otherwise they
  // explain for 3s that they're placed on the photo.
  const hintOpacity = useSharedValue(0);
  // 3D parts follow the head; a sticker-only "model" filter needs no tracking.
  const has3d = filter.type === "model" && (filter.parts?.length ?? 0) > 0;
  const trackingFaces =
    (filter.type === "face" || has3d) && !!cameraModule?.tracksFaces;
  const { push: onFaces } = useFaceTracking(view, trackingFaces);
  // Filters with a background need MediaPipe's person mask, whatever the dev flag says.
  // Not forced for every 3D filter: MediaPipe on the GPU next to Filament made the camera
  // stall on device (mouth anchors fall back to an estimate from the eyes).
  useEffect(() => {
    useFaceFlags.setState({
      mediapipeRequired: filter.background !== undefined,
    });
    return () => useFaceFlags.setState({ mediapipeRequired: false });
  }, [filter.background]);
  const noFace = useLiveEyes((s) => s.eyes.length === 0);
  const faceHint =
    filter.type !== "face" || !cameraModule?.detectsFaces
      ? undefined
      : trackingFaces
        ? noFace
          ? FIND_FACE_HINT
          : undefined
        : FACE_HINT[filter.id];
  useEffect(() => {
    const flashFor = (ms: number) =>
      withSequence(
        withTiming(1, { duration: 0 }),
        withDelay(ms, withTiming(0, { duration: FADE_MS })),
      );
    nameOpacity.value = filter.type === "none" ? 0 : flashFor(NAME_VISIBLE_MS);
    hintOpacity.value = faceHint ? flashFor(HINT_VISIBLE_MS) : 0;
  }, [filterId, filter.type, faceHint, nameOpacity, hintOpacity]);
  const nameStyle = useAnimatedStyle(() => ({ opacity: nameOpacity.value }));
  const hintStyle = useAnimatedStyle(() => ({ opacity: hintOpacity.value }));

  const onIndexChange = (index: number) => {
    const next = FILTERS[index];
    if (!next || next.id === useCameraSettings.getState().filterId) return;
    setFilter(next.id);
    Haptics.selectionAsync().catch(() => {});
    AccessibilityInfo.announceForAccessibility(next.name);
  };

  const allowCamera = async () => {
    const asked = Date.now();
    const granted = await permission.requestPermission();
    // An instant "no" means Android won't show the prompt again: open Settings.
    if (!granted && Date.now() - asked < 400) Linking.openSettings();
  };

  const shoot = async () => {
    if (busy || !cameraModule || !camera.current || !view || !zone) return;
    setBusy(true);
    let restoreBrightness: number | null = null;
    try {
      for (let n = timer; n > 0; n--) {
        setCount(n);
        await wait(1000);
      }
      setCount(null);

      // Front camera: light the face with a full-white screen at full brightness.
      const front = facing === "front";
      if (front && flash === "on") {
        setScreenFlash(true);
        const screen = brightness();
        if (screen) {
          restoreBrightness = await screen.getBrightnessAsync();
          await screen.setBrightnessAsync(1);
        }
        await wait(250);
      }

      // 3D filters: what is drawn over the preview right now goes into the photo.
      const screenLayer =
        filter.type === "model" ? await snapshotModelLayer() : null;
      const shot = await camera.current.capture(front ? "off" : flash);
      useLastShot.getState().set(shot.uri);
      if (player) {
        player.seekTo(0);
        player.play();
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setScreenFlash(false);

      // The preview "covers" the page: the photo keeps exactly that visible area, and
      // the safe zone maps onto it (1dp on screen = 1 / scale photo pixels).
      const scale = Math.max(
        view.width / shot.width,
        view.height / shot.height,
      );
      const toPhoto = (r: Rect): Rect => ({
        x: (shot.width - view.width / scale) / 2 + (r.x - view.x) / scale,
        y: (shot.height - view.height / scale) / 2 + (r.y - view.y) / scale,
        width: r.width / scale,
        height: r.height / scale,
      });
      const photoZone = toPhoto(zone);
      let notice: string | undefined;
      let faces: ReturnType<typeof approxEyes>[] = [];
      if (filter.type === "face") {
        faces = cameraModule.detectFaces(shot.uri);
        if (faces.length === 0) {
          faces = [approxEyes(photoZone)];
          notice = NO_FACE;
        }
      }
      const composed = await cameraModule.composePhoto({
        photoUri: shot.uri,
        filter,
        crop: toPhoto(view),
        layout: layoutFor(filter, photoZone, 1 / scale, {
          sticker: sticker ?? undefined,
          faces,
          centerX: toPhoto({ ...view, x: view.width / 2, width: 0 }).x,
        }),
        screenLayer,
      });
      useCreateStore
        .getState()
        .start(
          { uri: composed.uri, width: composed.width, height: composed.height },
          filter.id,
        );
      router.push({
        pathname: "/create/preview",
        params: notice ? { notice } : {},
      });
    } catch (err) {
      console.warn("[camera] capture failed", err);
      Alert.alert("Couldn't take the photo", "Give it another try.");
    } finally {
      setScreenFlash(false);
      setCount(null);
      setBusy(false);
      if (restoreBrightness !== null) {
        brightness()
          ?.setBrightnessAsync(restoreBrightness)
          .catch(() => {});
      }
    }
  };

  return (
    <View
      style={styles.screen}
      onLayout={(e) => setView({ ...e.nativeEvent.layout, x: 0, y: 0 })}
    >
      {cameraModule && permission.hasPermission ? (
        <cameraModule.CameraLayer
          ref={camera}
          facing={facing}
          active={focused && appActive}
          matrix={filter.matrix}
          live={live}
          flash={facing === "back" ? flash : "off"}
          onSlow={() => {
            liveFiltersOff = true;
            setLive(false);
          }}
          trackFaces={trackingFaces}
          onFaces={onFaces}
          background={filter.background}
          wantMesh={has3d}
        />
      ) : (
        <CameraCard
          title={
            cameraModule
              ? "Flicko needs your camera to snap memes"
              : "The camera needs a new build"
          }
          action={
            cameraModule
              ? { label: "Allow camera", onPress: allowCamera }
              : undefined
          }
        />
      )}

      {ready && zone && sticker && (
        <LiveOverlay
          filter={filter}
          zone={zone}
          centerX={view!.width / 2}
          sticker={sticker}
          onStickerChange={setStickerPose}
        />
      )}

      <TopBar
        onAvatar={() => router.push("/me")}
        onWallet={() => setSheet("wallet")}
        onConnect={() => setSheet("connect")}
        onPumping={() =>
          router.navigate({ pathname: "/markets", params: { sort: "gainers" } })
        }
      />
      <ToolRail />
      <FaceDebug view={view} />
      <FaceHud top={insets.top + 120} />

      {faceHint && view && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.hintRow,
            { top: labelTop - 12 - HINT_HEIGHT },
            hintStyle,
          ]}
        >
          <Glass style={styles.hint}>
            <Text style={styles.hintText}>{faceHint}</Text>
          </Glass>
        </Animated.View>
      )}

      {filter.type !== "none" && view && (
        <View pointerEvents="none" style={[styles.label, { top: labelTop }]}>
          <Animated.Text style={[styles.filterName, nameStyle]}>
            {filter.name}
          </Animated.Text>
          {isLocked(filter, unlocked.data) && (
            <Glass style={styles.premium}>
              <LockIcon />
              <Text style={styles.premiumText}>
                Premium · unlock for {filter.priceSkr} SKR
              </Text>
            </Glass>
          )}
        </View>
      )}

      <View style={[styles.carousel, { bottom: SHUTTER_CENTER - SHUTTER / 2 }]}>
        <FilterCarousel
          ref={carousel}
          initialIndex={initialIndex}
          onIndexChange={onIndexChange}
          onShutter={shoot}
          shutterDisabled={!ready || busy}
        />
      </View>
      <View style={[styles.chips, { bottom: CHIPS_BOTTOM }]}>
        <CategoryChips
          selected={filter.type === "none" ? undefined : filter.category}
          onSelect={(category) =>
            carousel.current?.scrollTo(firstIndexOf(category))
          }
        />
      </View>

      {count !== null && (
        <View pointerEvents="none" style={styles.countdown}>
          <Text style={styles.count} accessibilityLiveRegion="assertive">
            {count}
          </Text>
        </View>
      )}
      {screenFlash && <View pointerEvents="none" style={styles.flash} />}

      {sheet === "wallet" && <WalletSheet onClose={() => setSheet(null)} />}
      {sheet === "connect" && (
        <ConnectFlow
          onClose={() => setSheet(null)}
          onBrowse={() => setSheet(null)}
        />
      )}
    </View>
  );
}

function CameraCard({
  title,
  action,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.cardWrap}>
      <View style={styles.card}>
        <Image
          source={bobo}
          style={styles.bobo}
          contentFit="contain"
          accessibilityLabel="Bobo the monkey cheering in sunglasses"
        />
        <Text style={[type.sheetTitle, styles.cardTitle]}>{title}</Text>
        {!action && (
          <Text style={styles.cardBody}>
            Install a new development build to use the camera.
          </Text>
        )}
        {action && (
          <View style={{ alignSelf: "stretch" }}>
            <Button label={action.label} onPress={action.onPress} />
          </View>
        )}
      </View>
    </View>
  );
}

const useAppActive = () => {
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => sub.remove();
  }, []);
  return active;
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  label: {
    position: "absolute",
    left: 0,
    right: 0,
    height: LABEL_HEIGHT,
    alignItems: "center",
    gap: 8,
  },
  filterName: {
    fontFamily: "DMSans_700Bold",
    fontSize: 17,
    color: colors.text,
  },
  premium: {
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  premiumText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    color: colors.text,
  },
  hintRow: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  hint: {
    height: HINT_HEIGHT,
    borderRadius: HINT_HEIGHT / 2,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  hintText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    color: colors.text,
  },
  carousel: { position: "absolute", left: 0, right: 0, height: SHUTTER },
  chips: { position: "absolute", left: 0, right: 0 },
  countdown: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  count: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 120,
    lineHeight: 130,
    color: colors.text,
  },
  flash: { ...StyleSheet.absoluteFill, backgroundColor: colors.text },
  cardWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 140,
  },
  card: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: 14,
    padding: 24,
    borderRadius: 28,
    backgroundColor: ref.sheet,
    borderWidth: 1,
    borderColor: ref.line,
  },
  bobo: { width: 120, height: 148 },
  cardTitle: { color: colors.text, textAlign: "center" },
  cardBody: {
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    lineHeight: 22,
    color: ref.textSoft,
    textAlign: "center",
  },
});
