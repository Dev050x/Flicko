import { useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, TextButton } from "@/components/ui/button";
import { DevnetPill } from "@/components/ui/devnet-pill";
import { WalletIcon } from "@/components/ui/icons";
import { Wordmark } from "@/components/ui/wordmark";
import {
  ConnectFlow,
  type ConnectState,
} from "@/components/wallet/connect-flow";
import { MemeWall } from "@/components/welcome/meme-wall";
import { useSession } from "@/store/session";
import { colors, type } from "@/theme";

/*
 * Login (design-reference/Login.html, 412x920): the live Meme Wall on top and a solid
 * panel from y=500 with the pitch, "Connect wallet" and "Just browse". The panel keeps
 * its 420dp height and sits on the bottom edge; the wall runs 140dp behind it.
 */
const PANEL = 420;
const WALL_OVERLAP = 140;

export default function Welcome({ preview }: { preview?: ConnectState }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const browseAsGuest = useSession((s) => s.browseAsGuest);
  const [connecting, setConnecting] = useState(preview !== undefined);

  const panelTop = height - PANEL - insets.bottom;
  const browse = () => {
    setConnecting(false);
    browseAsGuest();
  };

  return (
    <View style={styles.screen}>
      <View style={StyleSheet.absoluteFill}>
        <MemeWall width={width} height={panelTop + WALL_OVERLAP} />
      </View>
      <View style={[styles.pill, { top: insets.top + 12 }]}>
        <DevnetPill />
      </View>

      <View style={[styles.panel, { top: panelTop }]}>
        <View style={styles.pitch}>
          <Wordmark size={22} letterSpacing={-0.8} />
          <Text
            style={[type.hero, { color: colors.text }]}
            accessibilityRole="header"
          >
            Every photo{"\n"}is a{" "}
            <Text style={{ color: colors.accent }}>coin.</Text>
          </Text>
          <Text style={styles.sub}>
            Snap it. Caption it. Trade it.{"\n"}The meme market for Solana
            Seeker.
          </Text>
        </View>
        <View style={styles.actions}>
          <Button
            label="Connect wallet"
            icon={<WalletIcon />}
            onPress={() => setConnecting(true)}
          />
          <TextButton label="Just browse" onPress={browse} />
        </View>
        <Text style={[styles.legal, { bottom: 18 + insets.bottom }]}>
          By continuing you agree to the Terms. Flicko never holds your keys.
        </Text>
      </View>

      {connecting && (
        <ConnectFlow
          preview={preview}
          onClose={() => setConnecting(false)}
          onBrowse={browse}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pill: { position: "absolute", right: 18 },
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  pitch: { position: "absolute", top: 32, left: 24, right: 24, gap: 12 },
  sub: {
    fontFamily: "DMSans_400Regular",
    fontSize: 16,
    lineHeight: 23.2,
    color: colors.textMuted,
  },
  actions: { position: "absolute", top: 262, left: 24, right: 24, gap: 4 },
  legal: {
    ...type.legal,
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    color: colors.textFaint,
  },
});
