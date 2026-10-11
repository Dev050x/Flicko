import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Glass } from "@/components/ui/glass";
import { formatSkr, useSkrBalance } from "@/features/wallet/skr-balance";
import { useMyAvatar } from "@/features/avatars/catalog";
import { useSession } from "@/store/session";
import { colors } from "@/theme";

const SKR_TOKEN = require("../../../assets/brand/skr-token.png");

/*
 * Top left: avatar (→ profile) and the SKR balance pill (→ wallet sheet; "Connect" for
 * guests).
 */
export function TopBar({
  onAvatar,
  onWallet,
  onConnect,
}: {
  onAvatar: () => void;
  onWallet: () => void;
  onConnect: () => void;
}) {
  const insets = useSafeAreaInsets();
  const session = useSession((s) => s.session);
  const avatar = useMyAvatar();
  const balance = useSkrBalance(session?.wallet);

  const skrLabel = !session
    ? "Connect"
    : balance.data === undefined
      ? "– SKR"
      : `${formatSkr(balance.data)} SKR`;

  return (
    <View style={[styles.row, { top: insets.top + 12 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Profile"
        onPress={onAvatar}
        hitSlop={4}
        style={styles.avatar}
      >
        <Image
          source={avatar}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={session ? `Wallet, ${skrLabel}` : "Connect wallet"}
        onPress={session ? onWallet : onConnect}
        hitSlop={8}
      >
        <Glass style={styles.skr}>
          <Image source={SKR_TOKEN} style={styles.coin} />
          <Text style={styles.skrText}>{skrLabel}</Text>
        </Glass>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: "absolute",
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.text,
    overflow: "hidden",
  },
  skr: {
    height: 32,
    borderRadius: 16,
    paddingLeft: 8,
    paddingRight: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  coin: { width: 16, height: 16 },
  skrText: { fontFamily: "DMSans_700Bold", fontSize: 14, color: colors.text },
});
