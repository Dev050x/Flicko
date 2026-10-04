import { Image } from "expo-image";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CopyIcon, SealIcon } from "@/components/ui/icons";
import { avatarSource } from "@/features/avatars/catalog";
import { compact, shortAddress } from "@/lib/format";
import type { Profile } from "@/features/profile/api";
import { colors, mono, profile as p } from "@/theme";

/*
 * Who this is: 84dp avatar beside Memes / Followers / Following, then name with the
 * Seeker badge, @handle and short wallet (tap to copy), bio, and the screen's buttons.
 */
export function Identity({
  data,
  seeker,
  onAvatar,
  onCopy,
  onStat,
  children,
}: {
  data: Profile;
  seeker: boolean;
  onAvatar?: () => void;
  onCopy: () => void;
  onStat?: (stat: "followers" | "following") => void;
  children?: ReactNode;
}) {
  const name = data.displayName || data.username || shortAddress(data.wallet);
  const stats = [
    { key: "memes", label: "Memes", value: data.counts.memes },
    { key: "followers", label: "Followers", value: data.counts.followers },
    { key: "following", label: "Following", value: data.counts.following },
  ] as const;

  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole={onAvatar ? "button" : "image"}
          accessibilityLabel={
            onAvatar ? "Change profile picture" : `${name}'s profile picture`
          }
          disabled={!onAvatar}
          onPress={onAvatar}
        >
          <Image
            source={avatarSource(data.avatarUrl, data.avatarId)}
            style={styles.avatar}
            contentFit="cover"
          />
        </Pressable>
        <View style={styles.stats}>
          {stats.map((s) => (
            <Pressable
              key={s.key}
              accessibilityLabel={`${s.value.toLocaleString("en-US")} ${s.label.toLowerCase()}`}
              disabled={s.key === "memes" || !onStat}
              onPress={() => s.key !== "memes" && onStat?.(s.key)}
              style={styles.stat}
            >
              <Text style={styles.statValue}>{compact(s.value)}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.names}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {seeker && (
            <View style={styles.badge} accessibilityLabel="Verified Seeker">
              <SealIcon size={14} color={colors.text} />
              <Text style={styles.badgeText}>Seeker</Text>
            </View>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy wallet address"
          onPress={onCopy}
          hitSlop={8}
          style={styles.handleRow}
        >
          {data.username && <Text style={styles.handle}>@{data.username}</Text>}
          {data.username && <Text style={styles.handle}>·</Text>}
          <Text style={styles.address}>{shortAddress(data.wallet)}</Text>
          <CopyIcon />
        </Pressable>
        {data.bio ? (
          <Text style={styles.bio} numberOfLines={2}>
            {data.bio}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  top: { flexDirection: "row", alignItems: "center", gap: 20 },
  avatar: { width: 84, height: 84, borderRadius: 42 },
  stats: { flex: 1, flexDirection: "row", justifyContent: "space-around" },
  stat: { alignItems: "center", gap: 2, minWidth: 56 },
  statValue: { fontFamily: mono.medium, fontSize: 17, color: colors.text },
  statLabel: { fontFamily: "DMSans_400Regular", fontSize: 12, color: p.muted },
  names: { gap: 6 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: {
    flexShrink: 1,
    fontFamily: "DMSans_700Bold",
    fontSize: 20,
    color: colors.text,
  },
  badge: {
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: p.seeker,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  badgeText: { fontFamily: "DMSans_700Bold", fontSize: 11, color: colors.text },
  handleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  handle: { fontFamily: "DMSans_400Regular", fontSize: 14, color: p.muted },
  address: { fontFamily: mono.medium, fontSize: 13, color: p.muted },
  bio: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    lineHeight: 20,
    color: p.bio,
  },
});

export function ProfileButton({
  label,
  onPress,
  primary = false,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={busy}
      style={[
        buttons.base,
        primary ? buttons.primary : buttons.neutral,
        busy && { opacity: 0.6 },
      ]}
    >
      <Text style={buttons.text}>{label}</Text>
    </Pressable>
  );
}

export const ButtonRow = ({ children }: { children: ReactNode }) => (
  <View style={buttons.row}>{children}</View>
);

const buttons = StyleSheet.create({
  row: { flexDirection: "row", gap: 8 },
  base: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  neutral: { backgroundColor: p.card, borderWidth: 1, borderColor: p.line },
  primary: { backgroundColor: colors.accent },
  text: { fontFamily: "DMSans_700Bold", fontSize: 14, color: colors.text },
});
