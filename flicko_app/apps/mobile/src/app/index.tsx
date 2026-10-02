import { Link } from "expo-router";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { LogoTile } from "@/components/brand/logo-tile";
import { Wordmark } from "@/components/brand/wordmark";
import { LOCKUP, lockupScale } from "@/components/intro/intro";

/*
 * Placeholder landing screen until onboarding is built. It matches the last intro frame
 * (same LOCKUP positions), so the intro fades into it without a jump;
 * only "Built for Solana Seeker" is new, just under the tagline.
 */
export default function Home() {
  const { width } = useWindowDimensions();
  const k = lockupScale(width);
  const below = (top: number) => [styles.below, { marginTop: top * k }];

  return (
    <View className="flex-1 bg-ink">
      <View style={styles.centre} pointerEvents="none">
        <View style={{ transform: [{ translateY: LOCKUP.tileCentre * k }] }}>
          <LogoTile size={LOCKUP.tile * k} />
        </View>
      </View>
      <View style={below(LOCKUP.wordmarkTop)}>
        <Wordmark
          size={LOCKUP.wordmarkSize * k}
          letterSpacing={LOCKUP.wordmarkSpacing * k}
        />
      </View>
      <View style={below(LOCKUP.taglineTop)}>
        <Text
          className="font-sans text-haze"
          style={{ fontSize: LOCKUP.taglineSize * k }}
        >
          Snap it. Caption it. Trade it.
        </Text>
        <Text
          className="font-sans text-dusk"
          style={{ fontSize: 12 * k, marginTop: 4 * k }}
        >
          Built for Solana Seeker
        </Text>
      </View>
      {__DEV__ && (
        <Link
          href="/dev/intro-frames"
          className="absolute bottom-12 self-center"
        >
          <Text className="font-medium text-sm text-pink">Intro frames</Text>
        </Link>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centre: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  below: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "50%",
    alignItems: "center",
  },
});
