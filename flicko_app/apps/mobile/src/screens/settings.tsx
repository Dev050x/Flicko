import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HeaderBar } from "@/components/profile/header-bar";
import { shortAddress } from "@/lib/format";
import { clipboard } from "@/lib/native";
import { registerPush } from "@/lib/push";
import { useSession } from "@/store/session";
import { colors, profile as p, type } from "@/theme";

/*
 * Settings placeholder: your wallet, notifications and sign out.
 */
export default function Settings() {
  const insets = useSafeAreaInsets();
  const session = useSession((s) => s.session);
  const signOut = useSession((s) => s.signOut);
  const [note, setNote] = useState<string | null>(null);

  const copy = async () => {
    const board = clipboard();
    if (!board || !session) return;
    await board.setStringAsync(session.wallet);
    setNote("Address copied");
  };

  const notify = async () => {
    const ok = await registerPush(session!.token).catch(() => false);
    setNote(
      ok
        ? "Notifications are on"
        : "Couldn't turn on notifications. Check your phone's settings.",
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <HeaderBar />
      <View style={styles.body}>
        <Text
          style={[type.h1, { color: colors.text }]}
          accessibilityRole="header"
        >
          Settings
        </Text>
        <View style={styles.card}>
          <Row
            label="Wallet"
            value={session ? shortAddress(session.wallet) : "Not connected"}
            onPress={session ? copy : undefined}
          />
          <Row
            label="Notifications"
            value="Turn on"
            onPress={session ? notify : undefined}
          />
        </View>
        {note && <Text style={styles.note}>{note}</Text>}
        {session && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              signOut();
              router.replace("/");
            }}
            style={styles.out}
          >
            <Text style={styles.outText}>Sign out</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function Row({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={!onPress}
      onPress={onPress}
      style={styles.row}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: 16, paddingTop: 8, gap: 16 },
  card: {
    borderRadius: 16,
    backgroundColor: p.card,
    borderWidth: 1,
    borderColor: p.line,
    paddingHorizontal: 16,
  },
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLabel: {
    fontFamily: "DMSans_500Medium",
    fontSize: 15,
    color: colors.text,
  },
  rowValue: { fontFamily: "DMSans_400Regular", fontSize: 15, color: p.muted },
  note: { fontFamily: "DMSans_400Regular", fontSize: 13, color: p.muted },
  out: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: p.line,
    alignItems: "center",
    justifyContent: "center",
  },
  outText: { fontFamily: "DMSans_700Bold", fontSize: 15, color: colors.loss },
});
