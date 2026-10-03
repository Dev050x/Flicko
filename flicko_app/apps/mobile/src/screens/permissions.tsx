import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, TextButton } from "@/components/ui/button";
import { ViewfinderIcon } from "@/components/ui/icons";
import { StepBar } from "@/components/ui/step-bar";
import { camera, notifications } from "@/lib/native";
import { useSession } from "@/store/session";
import { colors, radius, ref, type } from "@/theme";

const bobo = require("../../assets/characters/bobo-cheer.png");

/*
 * Permission priming, step 2 of 2 (design-reference/ProfileSetup.html, right): explain,
 * then ask for the camera and straight after for notifications. "Not now" skips both;
 * the app asks again in context later.
 */
export default function Permissions() {
  const insets = useSafeAreaInsets();
  const finishOnboarding = useSession((s) => s.finishOnboarding);
  const [asking, setAsking] = useState(false);

  const allow = async () => {
    setAsking(true);
    try {
      await camera()?.Camera.requestCameraPermissionsAsync();
      await notifications()?.requestPermissionsAsync();
    } catch (err) {
      console.warn("[permissions] request failed", err);
    } finally {
      setAsking(false);
      finishOnboarding();
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <StepBar
        step={2}
        onBack={() => (router.canGoBack() ? router.back() : undefined)}
      />

      <View style={styles.art}>
        <ViewfinderIcon size={240} />
        <Image
          source={bobo}
          style={styles.bobo}
          contentFit="contain"
          accessibilityLabel="Bobo the monkey cheering in sunglasses"
        />
      </View>

      <View style={styles.copy}>
        <Text style={[type.h1, styles.title]} accessibilityRole="header">
          Snap memes,{"\n"}not screenshots
        </Text>
        <Text style={styles.body}>
          Flicko uses your camera to turn moments into memes. Nothing is posted
          until you tap Post.
        </Text>
        <View style={styles.notice}>
          <View style={styles.noticeIcon} />
          <View style={{ gap: 2, flex: 1 }}>
            <Text style={styles.noticeTitle}>Your meme is up 50% 🚀</Text>
            <Text style={styles.noticeText}>
              Next, we'll ask to send alerts like this.
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.footer, { bottom: 40 + insets.bottom }]}>
        <Button label="Allow camera" onPress={allow} disabled={asking} />
        <TextButton label="Not now" onPress={finishOnboarding} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  art: {
    alignSelf: "center",
    width: 240,
    height: 240,
    marginTop: 40,
  },
  bobo: { position: "absolute", left: 48, top: 26, width: 144, height: 178 },
  copy: { marginTop: 32, paddingHorizontal: 24, gap: 14 },
  title: { color: colors.text, lineHeight: 36 },
  body: {
    fontFamily: "DMSans_400Regular",
    fontSize: 16,
    lineHeight: 24,
    color: ref.textSoft,
  },
  notice: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    backgroundColor: ref.sheet,
    borderWidth: 1,
    borderColor: ref.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  noticeIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  noticeTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 14,
    color: colors.text,
  },
  noticeText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: ref.textSubtle,
  },
  footer: { position: "absolute", left: 24, right: 24, gap: 4 },
});
