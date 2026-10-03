import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TextButton } from "@/components/ui/button";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { useSession } from "@/store/session";
import { colors, ref, type } from "@/theme";

const defaultAvatar = require("../../assets/brand/flicko-pfp-dark-ring-1024.png");

/*
 * Profile placeholder (from the camera's avatar) until created memes and creator
 * earnings are built.
 */
export default function Me() {
  const insets = useSafeAreaInsets();
  const { session, avatarUri, signOut } = useSession();
  const short = session
    ? `${session.wallet.slice(0, 4)}…${session.wallet.slice(-4)}`
    : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => router.back()}
        style={styles.back}
      >
        <ChevronLeftIcon />
      </Pressable>
      <View style={styles.body}>
        <Image
          source={avatarUri ? { uri: avatarUri } : defaultAvatar}
          style={styles.avatar}
          contentFit="cover"
        />
        <Text style={[type.h1, { color: colors.text }]}>Profile</Text>
        <Text style={styles.note}>
          {short ? `Signed in as ${short}` : "You're browsing as a guest."}
        </Text>
        <TextButton
          label={short ? "Sign out" : "Back to welcome"}
          onPress={signOut}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  back: {
    width: 48,
    height: 48,
    marginLeft: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  note: { fontFamily: "DMSans_400Regular", fontSize: 16, color: ref.textSoft },
});
