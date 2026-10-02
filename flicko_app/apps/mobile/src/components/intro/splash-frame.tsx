import { Text, useWindowDimensions, View } from "react-native";

import { LogoTile } from "@/components/brand/logo-tile";
import { Wordmark } from "@/components/brand/wordmark";

/*
 * The splash screen design (412px artboard): the tile centred over a violet glow, with the
 * wordmark and "on Solana Seeker" at the bottom. It sits exactly where the native splash
 * icon was, so hiding the native splash is seamless.
 */
export function SplashFrame() {
  const { width } = useWindowDimensions();
  const v = width / 412;

  return (
    <View className="flex-1 items-center justify-center bg-ink">
      <LogoTile size={136 * v} />
      <View
        className="absolute left-0 right-0 items-center"
        style={{ bottom: 56 * v, gap: 6 * v }}
      >
        <Wordmark size={22 * v} letterSpacing={-0.8 * v} opacity={0.9} />
        <Text
          className="font-sans text-smoke"
          style={{ fontSize: 12 * v, letterSpacing: 0.4 * v }}
        >
          on Solana Seeker
        </Text>
      </View>
    </View>
  );
}
