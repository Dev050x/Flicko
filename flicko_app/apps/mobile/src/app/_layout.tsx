import "@/global.css";

import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import { Unbounded_800ExtraBold } from "@expo-google-fonts/unbounded";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { useFonts } from "expo-font";
import { Stack, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { colors } from "@/brand/logo";
import { Intro } from "@/components/intro/intro";
import { markIntroSeen, useFirstLaunch } from "@/lib/first-launch";

SplashScreen.preventAutoHideAsync();
/*
 * Expo Go always shows its own splash and warns on setOptions, so only dev/release builds fade.
 */
if (Constants.executionEnvironment !== ExecutionEnvironment.StoreClient) {
  SplashScreen.setOptions({ fade: true, duration: 150 });
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Unbounded_800ExtraBold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });
  const firstLaunch = useFirstLaunch();
  const [introDone, setIntroDone] = useState(false);
  const devScreen = usePathname().startsWith("/dev");
  const ready = (fontsLoaded || fontError !== null) && firstLaunch !== null;

  useEffect(() => {
    if (ready && devScreen) SplashScreen.hide();
  }, [ready, devScreen]);

  /*
   * The native splash stays up until fonts and the first-launch flag are loaded; the intro
   * then takes over from the same frame while the app renders underneath it.
   */
  return (
    <View className="flex-1 bg-ink">
      <StatusBar style="light" />
      {ready && (
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: "fade",
          }}
        />
      )}
      {ready && !introDone && !devScreen && (
        <Intro
          full={firstLaunch}
          onStart={() => SplashScreen.hide()}
          onDone={() => {
            if (firstLaunch) markIntroSeen();
            setIntroDone(true);
          }}
        />
      )}
    </View>
  );
}
