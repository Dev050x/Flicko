import { Image } from "expo-image";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { formatSkr, useSkrBalance } from "@/features/wallet/skr-balance";
import { useMyAvatar } from "@/features/avatars/catalog";
import { useSession } from "@/store/session";
import { feed, geist } from "@/theme";

/*
 * The menu under the feed's avatar: who you are (wallet + SKR balance) and where to go
 * next. Guests get "Connect wallet" instead. Tapping outside or back closes it.
 */

export type ProfileMenuAction = "profile" | "wallet" | "connect" | "signOut";

export function ProfileMenu({
  top,
  onClose,
  onAction,
}: {
  top: number;
  onClose: () => void;
  onAction: (action: ProfileMenuAction) => void;
}) {
  const session = useSession((s) => s.session);
  const avatar = useMyAvatar();
  const balance = useSkrBalance(session?.wallet);
  const short = session
    ? `${session.wallet.slice(0, 4)}…${session.wallet.slice(-4)}`
    : null;

  const items: {
    action: ProfileMenuAction;
    label: string;
    danger?: boolean;
  }[] = session
    ? [
        { action: "profile", label: "My profile" },
        { action: "wallet", label: "Wallet" },
        { action: "signOut", label: "Sign out", danger: true },
      ]
    : [{ action: "connect", label: "Connect wallet" }];

  return (
    <Modal
      transparent
      visible
      statusBarTranslucent
      animationType="none"
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityLabel="Close menu"
        style={StyleSheet.absoluteFill}
        onPress={onClose}
      />
      <Animated.View
        entering={FadeIn.duration(120)}
        style={[styles.menu, { top }]}
      >
        <View style={styles.header}>
          <Image source={avatar} style={styles.avatar} contentFit="cover" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.name} numberOfLines={1}>
              {short ?? "Guest"}
            </Text>
            <Text style={styles.balance} numberOfLines={1}>
              {!session
                ? "Not connected"
                : balance.data == null
                  ? "— SKR"
                  : `${formatSkr(balance.data)} SKR`}
            </Text>
          </View>
        </View>
        <View style={styles.divider} />
        {items.map(({ action, label, danger }) => (
          <Pressable
            key={action}
            accessibilityRole="menuitem"
            onPress={() => onAction(action)}
            style={styles.item}
          >
            <Text style={[styles.itemText, danger && { color: feed.pinkText }]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: "absolute",
    left: 16,
    width: 240,
    backgroundColor: feed.sheet,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: feed.border,
    paddingVertical: 6,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: feed.raised,
  },
  name: { fontFamily: geist.semibold, fontSize: 15, color: feed.text },
  balance: {
    fontFamily: geist.regular,
    fontSize: 13,
    color: feed.textSecondary,
    fontVariant: ["tabular-nums"],
  },
  divider: {
    height: 1,
    backgroundColor: feed.border,
    marginHorizontal: 12,
    marginBottom: 4,
  },
  item: { height: 48, justifyContent: "center", paddingHorizontal: 16 },
  itemText: { fontFamily: geist.medium, fontSize: 15, color: feed.text },
});
