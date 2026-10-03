import "@/polyfills";
import "@/global.css";

import {
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from "@expo-google-fonts/bricolage-grotesque";
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import { Unbounded_800ExtraBold } from "@expo-google-fonts/unbounded";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { useFonts } from "expo-font";
import { Stack, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { Intro } from "@/components/intro/intro";
import { useSession } from "@/store/session";
import { colors } from "@/theme";

SplashScreen.preventAutoHideAsync();
/*
 * Expo Go always shows its own splash and warns on setOptions, so only dev/release builds fade.
 */
if (Constants.executionEnvironment !== ExecutionEnvironment.StoreClient) {
  SplashScreen.setOptions({ fade: true, duration: 150 });
}

const queryClient = new QueryClient();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    Unbounded_800ExtraBold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });
  const { hydrated, hydrate, session, isGuest, onboardingDone } = useSession();
  const [introDone, setIntroDone] = useState(false);
  const devScreen = usePathname().startsWith("/dev");
  const ready = (fontsLoaded || fontError !== null) && hydrated;

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (ready && devScreen) SplashScreen.hide();
  }, [ready, devScreen]);

  const signedIn = session !== null;

  /*
   * The native splash stays up until fonts load and the session is restored; the intro
   * then plays over the gated stack, which renders underneath it.
   */
  return (
    <QueryClientProvider client={queryClient}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style="light" />
        {ready && (
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: "fade",
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Protected guard={!signedIn && !isGuest}>
              <Stack.Screen name="(onboarding)/welcome" />
            </Stack.Protected>
            <Stack.Protected guard={signedIn && !onboardingDone}>
              <Stack.Screen name="(onboarding)/profile" />
              <Stack.Screen name="(onboarding)/permissions" />
              <Stack.Screen
                name="(onboarding)/avatar-camera"
                options={{ animation: "slide_from_bottom" }}
              />
            </Stack.Protected>
            <Stack.Protected guard={(signedIn && onboardingDone) || isGuest}>
              <Stack.Screen name="(main)" />
              <Stack.Screen name="me" options={{ animation: "slide_from_left" }} />
              <Stack.Screen
                name="create/preview"
                options={{ animation: "slide_from_bottom" }}
              />
            </Stack.Protected>
          </Stack>
        )}
        {ready && !introDone && !devScreen && (
          <Intro
            onStart={() => SplashScreen.hide()}
            onDone={() => setIntroDone(true)}
          />
        )}
      </View>
    </QueryClientProvider>
  );
}
