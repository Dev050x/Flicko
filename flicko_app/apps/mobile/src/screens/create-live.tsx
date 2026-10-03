import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect } from "react";
import { BackHandler, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, TextButton } from "@/components/ui/button";
import { ShareIcon } from "@/components/ui/icons";
import { config } from "@/config";
import { sceneAspect } from "@/features/create/scene";
import { PRICE_TIERS, useCreateStore } from "@/features/create/store";
import { fitIn, useScene } from "@/features/create/use-scene";
import { colors } from "@/theme";

/*
 * 5 · Live (design-reference/CreateFlow.html): the posted meme (the exact uploaded
 * file) with a LIVE chip, Share to X, View meme, and Snap another. A light success
 * haptic on arrival, no confetti. Back means "snap another".
 */
const CARD = { width: 248, height: 310 };
const LEAVE_MS = 400;

export default function CreateLive() {
  const insets = useSafeAreaInsets();
  const { mint } = useLocalSearchParams<{ mint: string }>();
  const scene = useScene({ withCaption: true });
  const prepared = useCreateStore((s) => s.launch.prepared);
  const price = useCreateStore((s) => s.price);
  const reset = useCreateStore((s) => s.reset);
  const symbol = prepared?.symbol ?? useCreateStore.getState().symbol;
  const card = scene ? fitIn(sceneAspect(scene), CARD) : CARD;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  // Back to the camera; the flow is cleared once the create screens have gone.
  const snapAnother = useCallback(() => {
    router.dismissTo("/camera");
    setTimeout(reset, LEAVE_MS);
  }, [reset]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        snapAnother();
        return true;
      });
      return () => sub.remove();
    }, [snapAnother]),
  );

  const share = () => {
    const link = `${config.siteUrl}/m/${mint}`;
    Share.share({
      message: `just launched $${symbol} on flicko 📸 ${link}`,
      url: prepared?.fileUri,
    }).catch(() => {});
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 56 }]}>
      <View style={styles.middle}>
        <View style={{ width: card.width, height: card.height }}>
          <View style={styles.card}>
            {prepared && (
              <Image
                source={{ uri: prepared.fileUri }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                accessibilityLabel={`Your meme, $${symbol}`}
              />
            )}
          </View>
          <View style={styles.chip}>
            <View style={styles.dot} />
            <Text style={styles.chipText}>LIVE · {PRICE_TIERS[price].skr} SKR</Text>
          </View>
        </View>
        <View style={styles.copy}>
          <Text style={styles.title} accessibilityRole="header">
            Your meme is live
          </Text>
          <Text style={styles.subtitle}>
            ${symbol} is trading now. First buyers get the best price.
          </Text>
        </View>
      </View>

      <View style={[styles.actions, { paddingBottom: insets.bottom + 24 }]}>
        <Button label="Share to X" icon={<ShareIcon />} onPress={share} />
        <TextButton
          label="View meme"
          onPress={() => router.push({ pathname: "/meme/[mint]", params: { mint } })}
        />
        <Text
          accessibilityRole="button"
          onPress={snapAnother}
          style={styles.snapAnother}
          suppressHighlighting
        >
          Snap another
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  middle: { flex: 1, alignItems: "center", gap: 22 },
  card: {
    flex: 1,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#000000",
  },
  chip: {
    position: "absolute",
    left: 12,
    bottom: 16,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    backgroundColor: "rgba(14,11,20,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gain },
  chipText: { fontFamily: "DMSans_700Bold", fontSize: 12, color: colors.text },
  copy: { alignItems: "center", gap: 8, paddingHorizontal: 24 },
  title: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 36,
    letterSpacing: -1.4,
    color: colors.text,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    lineHeight: 21,
    color: colors.textMuted,
    textAlign: "center",
  },
  actions: { paddingHorizontal: 24, alignItems: "stretch", gap: 4 },
  snapAnother: {
    alignSelf: "center",
    paddingVertical: 12,
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: colors.textFaint,
  },
});
