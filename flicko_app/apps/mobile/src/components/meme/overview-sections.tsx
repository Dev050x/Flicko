import { Image } from "expo-image";
import { Fragment, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";

import { CheckIcon, CopyIcon, ExternalIcon, WarningIcon } from "@/components/markets/icons";
import { REACTIONS, type MemeView, type ReactionKind, type SafetyChecks } from "@/features/meme/api";
import { compact, grouped, priceSkr, shortAddress } from "@/lib/format";
import { colors, fonts, mono } from "@/theme";
import { changeStyle } from "@/theme/priceChange";

/*
 * The cards of the meme page's Overview tab (MemeDetail-overview.png), top to bottom
 * below the tabs. Labels are DM Sans, numbers DM Mono 500.
 */
const defaultAvatar = require("../../../assets/brand/flicko-pfp-dark-ring-1024.png");

/** Creator holding this share of supply or more fails the safety check. */
export const CREATOR_LIMIT_PCT = 5;

function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const signed = (n: number, digits?: number) =>
  `${n >= 0 ? "+" : "−"}${digits === undefined ? compact(Math.abs(n)) : Math.abs(n).toFixed(digits)}`;

export function PositionCard({ meme }: { meme: MemeView }) {
  const p = meme.position;
  if (!p) return null;
  const tone = changeStyle(p.pnlPct);
  return (
    <Card style={styles.position}>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={styles.label}>Your position</Text>
        <Text style={styles.positionAmount}>
          {compact(p.tokens)} <Text style={styles.positionTicker}>${meme.symbol}</Text>
        </Text>
        <Text style={styles.label}>
          Avg buy <Text style={styles.monoMuted}>{priceSkr(p.avgBuySkr)}</Text>
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 8 }}>
        <Text style={styles.positionValue}>
          {compact(p.valueSkr)} <Text style={styles.unit}>SKR</Text>
        </Text>
        <Text style={[styles.pnl, { color: tone.text }]}>
          {signed(p.pnlSkr)} SKR · {signed(p.pnlPct, 0)}%
        </Text>
      </View>
    </Card>
  );
}

export function StatsGrid({ meme }: { meme: MemeView }) {
  const cells = [
    { label: "Market cap", value: compact(meme.marketCapSkr) },
    { label: "Liquidity", value: compact(meme.liquiditySkr) },
    { label: "Holders", value: grouped(meme.holders) },
    { label: "Volume 24H", value: compact(meme.volume24hSkr) },
    { label: "Trades 24H", value: grouped(meme.trades24h) },
    { label: "Supply", value: compact(meme.supply) },
  ];
  return (
    <View style={{ gap: 10 }}>
      <Card style={styles.grid}>
        {cells.map((c) => (
          <View key={c.label} style={styles.gridCell}>
            <Text style={styles.label}>{c.label}</Text>
            <Text style={styles.gridValue}>{c.value}</Text>
          </View>
        ))}
      </Card>
      <Text style={styles.caption}>
        Values in SKR. {meme.phase === "pool" ? "Liquidity is locked in the pool forever." : "Liquidity locks in the pool forever when the launch sells out."}
      </Text>
    </View>
  );
}

export function ActivityCard({ meme }: { meme: MemeView }) {
  const { buys, sells, buyers, sellers } = meme.activity;
  const total = buys + sells;
  const buyShare = total === 0 ? 0.5 : buys / total;
  return (
    <Card style={{ gap: 14 }}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Activity · 24H</Text>
        <Text style={styles.cardMeta}>
          <Text style={styles.metaNum}>{grouped(buyers)}</Text> buyers ·{" "}
          <Text style={styles.metaNum}>{grouped(sellers)}</Text> sellers
        </Text>
      </View>
      <View style={styles.split}>
        {total === 0 ? (
          <View style={[styles.splitPart, { flex: 1, backgroundColor: colors.border }]} />
        ) : (
          <>
            {buys > 0 && <View style={[styles.splitPart, { flex: buyShare, backgroundColor: colors.gain }]} />}
            {sells > 0 && <View style={[styles.splitPart, { flex: 1 - buyShare, backgroundColor: colors.loss }]} />}
          </>
        )}
      </View>
      <View style={styles.cardHeader}>
        <Text style={styles.side}>
          <Text style={[styles.sideNum, { color: colors.gain }]}>{grouped(buys)}</Text> buys
        </Text>
        <Text style={styles.side}>
          <Text style={[styles.sideNum, { color: colors.loss }]}>{grouped(sells)}</Text> sells
        </Text>
      </View>
    </Card>
  );
}

export const safetyRows = (meme: MemeView, checks: SafetyChecks | undefined) => {
  const holdsOk = meme.creatorHoldsPct < CREATOR_LIMIT_PCT;
  return [
    { ok: checks?.mintAuthorityRevoked, claim: "Mint authority revoked", note: "Supply is fixed" },
    { ok: checks?.noFreezeAuthority, claim: "No freeze authority", note: "Wallets can't be frozen" },
    {
      ok: checks?.liquidityLocked,
      claim: "Liquidity locked",
      note: meme.phase === "pool" ? "Forever" : "At sell-out, forever",
    },
    {
      ok: holdsOk,
      claim: `Creator holds ${Number(meme.creatorHoldsPct.toFixed(1))}%`,
      note: holdsOk ? `Below ${CREATOR_LIMIT_PCT}%` : `${CREATOR_LIMIT_PCT}% or more`,
    },
  ];
};

export function SafetyCard({
  meme,
  checks,
  onLayout,
}: {
  meme: MemeView;
  checks: SafetyChecks | undefined;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const rows = safetyRows(meme, checks);
  return (
    <Card style={{ paddingVertical: 4 }}>
      <View onLayout={onLayout} style={[styles.cardHeader, { paddingVertical: 14 }]}>
        <Text style={styles.cardTitle}>Safety</Text>
        <Text style={styles.cardMeta}>Checked on-chain</Text>
      </View>
      {rows.map((r) => (
        <View key={r.claim} style={styles.safetyRow}>
          <View style={styles.safetyIcon}>
            {r.ok === undefined ? null : r.ok ? <CheckIcon size={16} /> : <WarningIcon size={16} />}
          </View>
          <Text style={[styles.safetyClaim, r.ok === false && { color: colors.loss }]} numberOfLines={1}>
            {r.claim}
          </Text>
          <Text style={[styles.safetyNote, r.ok === false && { color: colors.loss }]} numberOfLines={1}>
            {r.ok === undefined ? "Checking…" : r.note}
          </Text>
        </View>
      ))}
    </Card>
  );
}

export function Reactions({
  meme,
  onReact,
}: {
  meme: MemeView;
  onReact: (kind: ReactionKind, on: boolean) => void;
}) {
  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.cardTitle}>Reactions</Text>
      <View style={styles.reactions}>
        {REACTIONS.map(({ kind, emoji }) => {
          const on = meme.myReactions.includes(kind);
          return (
            <Pressable
              key={kind}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${kind}, ${meme.reactions[kind]}`}
              onPress={() => onReact(kind, !on)}
              style={[styles.reaction, on && styles.reactionOn]}
            >
              <Text style={styles.emoji}>{emoji}</Text>
              <Text style={styles.reactionCount}>{grouped(meme.reactions[kind])}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dateLabel = (ms: number) => {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

export function DetailsCard({
  meme,
  onCopy,
  onExplore,
}: {
  meme: MemeView;
  onCopy: (address: string) => void;
  onExplore: (address: string) => void;
}) {
  const address = (value: string) => (
    <View style={styles.addressRow}>
      <Text style={styles.detailValue}>{shortAddress(value)}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Copy address" hitSlop={10} onPress={() => onCopy(value)}>
        <CopyIcon size={16} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Open in explorer" hitSlop={10} onPress={() => onExplore(value)}>
        <ExternalIcon size={16} />
      </Pressable>
    </View>
  );
  const rows: { label: string; value: ReactNode }[] = [
    { label: "Created", value: <Text style={styles.detailText}>{dateLabel(meme.createdAt)}</Text> },
    {
      label: meme.phase === "pool" ? "In pool" : "In launch",
      value: (
        <Text style={styles.detailValue}>
          {compact(meme.pool.tokens)} ${meme.symbol} + {compact(meme.pool.skr)} SKR
        </Text>
      ),
    },
    { label: "Token address", value: address(meme.mint) },
    { label: "Pool address", value: address(meme.memePda) },
    {
      label: "Creator",
      value: (
        <View style={styles.addressRow}>
          <Image source={defaultAvatar} style={styles.creatorAvatar} />
          <Text style={styles.detailText}>
            {meme.creator.handle ? `@${meme.creator.handle}` : shortAddress(meme.creator.wallet)}
          </Text>
        </View>
      ),
    },
  ];
  return (
    <Card style={{ paddingVertical: 4 }}>
      <Text style={[styles.cardTitle, { paddingVertical: 14 }]}>Details</Text>
      {rows.map((r) => (
        <Fragment key={r.label}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{r.label}</Text>
            {r.value}
          </View>
        </Fragment>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  label: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
  unit: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted },
  monoMuted: { fontFamily: mono.medium, color: colors.textMuted },
  position: { flexDirection: "row", alignItems: "center" },
  positionAmount: { fontFamily: mono.medium, fontSize: 17, color: colors.text },
  positionTicker: { fontFamily: mono.medium },
  positionValue: { fontFamily: mono.medium, fontSize: 19, color: colors.text },
  pnl: { fontFamily: mono.medium, fontSize: 13 },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 22, paddingVertical: 18 },
  gridCell: { width: "33.33%", gap: 6 },
  gridValue: { fontFamily: mono.medium, fontSize: 17, color: colors.text },
  caption: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
  cardMeta: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
  metaNum: { fontFamily: mono.medium },
  split: { flexDirection: "row", height: 8, gap: 4 },
  splitPart: { height: 8, borderRadius: 4 },
  side: { fontFamily: fonts.body, fontSize: 14, color: colors.text },
  sideNum: { fontFamily: mono.medium },
  safetyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    height: 54,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  safetyIcon: { width: 18, alignItems: "center" },
  safetyClaim: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  safetyNote: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
  reactions: { flexDirection: "row", gap: 10 },
  reaction: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reactionOn: { borderColor: colors.text },
  emoji: { fontSize: 17 },
  reactionCount: { fontFamily: mono.medium, fontSize: 15, color: colors.text },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    height: 52,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailLabel: { fontFamily: fonts.body, fontSize: 15, color: colors.textMuted },
  detailText: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  detailValue: { fontFamily: mono.medium, fontSize: 14, color: colors.text },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  creatorAvatar: { width: 22, height: 22, borderRadius: 11 },
});
