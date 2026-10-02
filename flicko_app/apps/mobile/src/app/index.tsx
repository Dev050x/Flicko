import { Link } from "expo-router";
import { Text, View } from "react-native";

import { Glow } from "@/components/brand/glow";
import { LogoTile } from "@/components/brand/logo-tile";
import { Wordmark } from "@/components/brand/wordmark";

/*
 * Placeholder landing screen (the logo lockup) until onboarding is built.
 */
export default function Home() {
  return (
    <View className="flex-1 items-center justify-center bg-ink px-6">
      <View className="items-center justify-center">
        <View className="absolute">
          <Glow size={300} id="home-glow" />
        </View>
        <LogoTile size={136} shadow />
      </View>
      <View className="mt-8 items-center gap-3">
        <Wordmark size={44} letterSpacing={-1.7} />
        <Text className="font-medium text-lg text-mist">
          Snap it. Caption it. Trade it.
        </Text>
        <Text className="font-sans text-sm text-dusk">
          Built for Solana Seeker
        </Text>
      </View>
      {__DEV__ && (
        <Link href="/dev/intro-frames" className="absolute bottom-12">
          <Text className="font-medium text-sm text-pink">Intro frames</Text>
        </Link>
      )}
    </View>
  );
}
