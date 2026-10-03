import { Link } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, TextButton } from "@/components/ui/button";
import { DevnetPill } from "@/components/ui/devnet-pill";
import { WalletIcon } from "@/components/ui/icons";
import { Wordmark } from "@/components/ui/wordmark";
import { ConnectFlow } from "@/components/wallet/connect-flow";
import { useSession } from "@/store/session";
import { colors, ref, type } from "@/theme";

/*
 * Placeholder feed until the real one is built. Guests see "Connect wallet", which opens
 * the same connect sheet every gated action will use.
 */
export default function Feed() {
  const insets = useSafeAreaInsets();
  const session = useSession((s) => s.session);
  const signOut = useSession((s) => s.signOut);
  const [connecting, setConnecting] = useState(false);
  const short = session
    ? `${session.wallet.slice(0, 4)}…${session.wallet.slice(-4)}`
    : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <Wordmark size={22} letterSpacing={-0.8} />
        <DevnetPill />
      </View>
      <View style={styles.body}>
        <Text style={[type.h1, { color: colors.text }]}>Feed coming soon</Text>
        <Text style={styles.note}>
          {short ? `Signed in as ${short}` : "You're browsing as a guest."}
        </Text>
        {short ? (
          <TextButton label="Sign out" onPress={signOut} />
        ) : (
          <Button
            label="Connect wallet"
            icon={<WalletIcon />}
            onPress={() => setConnecting(true)}
          />
        )}
        {__DEV__ && (
          <View style={styles.dev}>
            <Link href="/dev/screens" style={styles.devLink}>
              Preview onboarding screens
            </Link>
            <Link href="/dev/intro-frames" style={styles.devLink}>
              Intro frames
            </Link>
            {!short && (
              <Text onPress={signOut} style={styles.devLink}>
                Back to welcome
              </Text>
            )}
          </View>
        )}
      </View>
      {connecting && (
        <ConnectFlow
          onClose={() => setConnecting(false)}
          onBrowse={() => setConnecting(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  body: { flex: 1, justifyContent: "center", paddingHorizontal: 24, gap: 12 },
  note: {
    fontFamily: "DMSans_400Regular",
    fontSize: 16,
    color: colors.textMuted,
  },
  dev: { marginTop: 24, gap: 16 },
  devLink: {
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    color: ref.textSubtle,
  },
});
