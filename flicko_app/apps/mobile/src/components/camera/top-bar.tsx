import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Glass } from "@/components/ui/glass";
import { formatSkr, useSkrBalance } from "@/features/wallet/skr-balance";
import { usePumpingCount } from "@/features/market/pumping";
import { useMyAvatar } from "@/features/avatars/catalog";
import { useSession } from "@/store/session";
import { cam, colors } from "@/theme";

/*
 * Top left: avatar (→ profile) and the SKR balance pill (→ wallet sheet; "Connect" for
 * guests). Below, centred: "🔥 N pumping" (→ Markets sorted by gainers), hidden at 0.
 */
export function TopBar({
  onAvatar,
  onWallet,
  onConnect,
  onPumping,
}: {
  onAvatar: () => void;
  onWallet: () => void;
  onConnect: () => void;
  onPumping: () => void;
}) {
  const insets = useSafeAreaInsets();
  const session = useSession((s) => s.session);
  const avatar = useMyAvatar();
  const balance = useSkrBalance(session?.wallet);
  const pumping = usePumpingCount();

  const skrLabel = !session
    ? "Connect"
    : balance.data === undefined
      ? "– SKR"
      : `${formatSkr(balance.data)} SKR`;

  return (
    <>
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
          accessibilityLabel={
            session ? `Wallet, ${skrLabel}` : "Connect wallet"
          }
          onPress={session ? onWallet : onConnect}
          hitSlop={8}
        >
          <Glass style={styles.skr}>
            <View style={styles.coin} />
            <Text style={styles.skrText}>{skrLabel}</Text>
          </Glass>
        </Pressable>
      </View>

      {!!pumping.data && (
        <View
          pointerEvents="box-none"
          style={[styles.pumpingRow, { top: insets.top + 64 }]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${pumping.data} memes pumping, open top gainers`}
            onPress={onPumping}
            hitSlop={9}
          >
            <Glass style={styles.pumping}>
              <Text style={styles.pumpingText}>🔥</Text>
              <Text style={styles.pumpingText}>{pumping.data} pumping</Text>
            </Glass>
          </Pressable>
        </View>
      )}
    </>
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
  coin: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: cam.coin,
    borderWidth: 2,
    borderColor: cam.coinRim,
  },
  skrText: { fontFamily: "DMSans_700Bold", fontSize: 14, color: colors.text },
  pumpingRow: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  pumping: {
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pumpingText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    color: colors.text,
  },
});
