import { Image } from "expo-image";
import { memo } from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";

import type { MemeView } from "@/features/meme/api";
import type { HoldersPage, HolderView } from "@/features/meme/tabs";
import { compact, grouped, tokensLive } from "@/lib/format";
import { detail as D, geist } from "@/theme";

import { Identicon } from "./identicon";

/*
 * Holders tab. Summary grid, a concentration bar (pool · top 10 · everyone else, adding
 * to 100%), the pool card, then ranked wallets (pool excluded). Holder count and the
 * creator's share come from the Overview's data so both tabs show the same numbers.
 */
export const HOLDER_ROW = 52;
const NUM: TextStyle = { fontVariant: ["tabular-nums"] };
const POOL_GREY = "#8C8898";
const ROW_LINE = D.rowLine;
const ME_TINT = "rgba(229,19,122,0.08)";

/** "18.4%", "1.96%", "<0.01%" */
export const sharePct = (pct: number) =>
  pct > 0 && pct < 0.01
    ? "<0.01%"
    : pct >= 10
      ? `${pct.toFixed(1)}%`
      : `${pct.toFixed(2)}%`;

const one = (pct: number) => `${pct.toFixed(1)}%`;

function Pending() {
  return <Text style={[styles.cellValue, { color: D.pending }]}>—</Text>;
}

export function HoldersSummary({
  meme,
  page,
}: {
  meme: MemeView;
  page: HoldersPage | undefined;
}) {
  const launching = meme.phase === "launching";
  const cells: { label: string; value: string | undefined }[] = [
    launching
      ? { label: "Buyers", value: grouped(meme.buyersTotal) }
      : { label: "Holders", value: grouped(meme.holders) },
    { label: "Top 10", value: page ? one(page.top10Pct) : undefined },
    { label: "Creator", value: one(meme.creatorHoldsPct) },
  ];

  // Shares in tenths of a percent, so the three legend values add up to exactly 100.
  const pool = page?.pool && !launching ? Math.round(page.pool.pct * 10) : 0;
  const top = page ? Math.round(page.top10Pct * 10) : 0;
  const rest = Math.max(0, 1000 - pool - top);
  const segments = [
    { label: "Pool", tenths: pool, color: POOL_GREY },
    { label: "Top 10 holders", tenths: top, color: D.accent },
    { label: "Everyone else", tenths: rest, color: D.line },
  ].filter((s) => !(launching && s.label === "Pool"));

  return (
    <View style={styles.summary}>
      <View style={styles.grid}>
        {cells.map((c, i) => (
          <View key={c.label} style={[styles.cell, i < 2 && styles.cellRight]}>
            <Text style={styles.cellLabel}>{c.label}</Text>
            {c.value === undefined ? (
              <Pending />
            ) : (
              <Text style={[styles.cellValue, NUM]}>{c.value}</Text>
            )}
          </View>
        ))}
      </View>

      {page && (
        <View style={{ gap: 8 }}>
          <View style={styles.bar} accessibilityLabel="Supply concentration">
            {segments
              .filter((s) => s.tenths > 0)
              .map((s) => (
                <View
                  key={s.label}
                  style={{ flex: s.tenths, backgroundColor: s.color }}
                />
              ))}
          </View>
          <View style={styles.legend}>
            {segments.map((s) => (
              <View key={s.label} style={styles.legendItem}>
                <View style={[styles.swatch, { backgroundColor: s.color }]} />
                <Text style={styles.legendText}>
                  {s.label}{" "}
                  <Text style={[NUM, { color: D.text }]}>
                    {(s.tenths / 10).toFixed(1)}%
                  </Text>
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {!launching && page?.pool && (
        <View style={styles.poolCard}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.poolTitle}>Liquidity pool</Text>
            <Text style={styles.poolNote}>
              Locked forever · not counted in Top 10
            </Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 2 }}>
            <Text style={[styles.poolShare, NUM]}>
              {sharePct(page.pool.pct)}
            </Text>
            <Text style={[styles.poolNote, NUM]}>
              {tokensLive(page.pool.tokens)} ${meme.symbol}
            </Text>
          </View>
        </View>
      )}

      {launching && (
        <Text style={styles.launchNote}>
          The pool is created when the launch sells out.
        </Text>
      )}

      <View style={styles.header}>
        <Text style={[styles.headText, styles.rankCol]}>#</Text>
        <Text style={[styles.headText, styles.nameCol]}>Holder</Text>
        <Text style={[styles.headText, styles.shareCol, styles.right]}>
          Share
        </Text>
        <Text style={[styles.headText, styles.amountCol, styles.right]}>
          Amount
        </Text>
      </View>
    </View>
  );
}

export const HolderRow = memo(function HolderRow({
  holder,
  symbol,
  topPct,
  launching,
  mine,
}: {
  holder: HolderView;
  symbol: string;
  /** the #1 holder's share, for the relative bar */
  topPct: number;
  launching: boolean;
  mine: boolean;
}) {
  const rel = topPct > 0 ? Math.min(1, holder.pct / topPct) : 0;
  return (
    <View
      style={[styles.row, mine && { backgroundColor: ME_TINT }]}
      accessible
      accessibilityLabel={`Rank ${holder.rank}, ${mine ? "you" : holder.label}${holder.isCreator ? ", creator" : ""}, ${sharePct(holder.pct)} of supply`}
    >
      <Text style={[styles.rank, styles.rankCol, NUM]}>{holder.rank}</Text>
      <View style={[styles.nameCol, { gap: 6 }]}>
        <View style={styles.nameLine}>
          {holder.avatar ? (
            <Image source={holder.avatar} style={styles.holderAvatar} />
          ) : (
            <Identicon address={holder.wallet} size={18} />
          )}
          <Text
            style={
              mine
                ? styles.you
                : holder.isAddress
                  ? styles.address
                  : styles.handle
            }
            numberOfLines={1}
          >
            {mine ? "You" : holder.label}
          </Text>
          {holder.isCreator && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>Creator</Text>
            </View>
          )}
        </View>
        <View style={styles.relTrack}>
          <View style={[styles.relFill, { width: `${rel * 100}%` }]} />
        </View>
      </View>
      <Text style={[styles.share, styles.shareCol, styles.right, NUM]}>
        {sharePct(holder.pct)}
      </Text>
      <View style={[styles.amountCol, { alignItems: "flex-end", gap: 2 }]}>
        <Text style={[styles.amount, NUM]} numberOfLines={1}>
          {tokensLive(holder.tokens)}
        </Text>
        {!launching && (
          <Text style={[styles.value, NUM]} numberOfLines={1}>
            {compact(holder.valueSkr)} SKR
          </Text>
        )}
      </View>
    </View>
  );
});

/* Three dim rows while holders load, or the empty line. */
export function HoldersFooter({
  state,
}: {
  state: "loading" | "empty" | "rows";
}) {
  if (state === "empty") {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          No holders yet. Be the first to buy.
        </Text>
      </View>
    );
  }
  if (state !== "loading") return null;
  return (
    <View style={{ opacity: 0.4 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.row}>
          <View style={[styles.rankCol]}>
            <View style={[styles.bone, { width: 10 }]} />
          </View>
          <View style={[styles.nameCol, { gap: 8 }]}>
            <View style={[styles.bone, { width: 90 }]} />
            <View style={[styles.bone, { width: 120, height: 3 }]} />
          </View>
          <View style={[styles.shareCol, { alignItems: "flex-end" }]}>
            <View style={[styles.bone, { width: 36 }]} />
          </View>
          <View style={[styles.amountCol, { alignItems: "flex-end" }]}>
            <View style={[styles.bone, { width: 44 }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { gap: 12, paddingTop: 16 },
  grid: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: D.line,
    borderRadius: D.radius,
  },
  cell: { flex: 1, paddingVertical: 12, paddingHorizontal: 14, gap: 4 },
  cellRight: { borderRightWidth: 1, borderRightColor: D.line },
  cellLabel: { fontFamily: geist.regular, fontSize: 13, color: D.muted },
  cellValue: { fontFamily: geist.medium, fontSize: 16, color: D.text },
  bar: {
    flexDirection: "row",
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
    gap: 2,
  },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontFamily: geist.regular, fontSize: 12, color: D.muted },
  poolCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: D.line,
    borderRadius: D.radius,
  },
  poolTitle: { fontFamily: geist.semibold, fontSize: 14, color: D.text },
  poolNote: { fontFamily: geist.regular, fontSize: 12, color: D.muted },
  poolShare: { fontFamily: geist.semibold, fontSize: 14, color: D.text },
  launchNote: { fontFamily: geist.regular, fontSize: 12, color: D.muted },
  header: {
    flexDirection: "row",
    alignItems: "center",
    height: 28,
    marginTop: 4,
  },
  headText: { fontFamily: geist.regular, fontSize: 12, color: D.muted },
  rankCol: { width: 30 },
  nameCol: { flex: 1, paddingRight: 8 },
  shareCol: { width: 64 },
  amountCol: { width: 84 },
  right: { textAlign: "right" },
  row: {
    height: HOLDER_ROW,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: ROW_LINE,
  },
  rank: { fontFamily: geist.regular, fontSize: 12, color: D.muted },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  holderAvatar: { width: 18, height: 18, borderRadius: 9 },
  handle: {
    flexShrink: 1,
    fontFamily: geist.medium,
    fontSize: 13,
    color: D.text,
  },
  address: {
    flexShrink: 1,
    fontFamily: geist.mono,
    fontSize: 13,
    color: D.secondary,
  },
  you: {
    flexShrink: 1,
    fontFamily: geist.semibold,
    fontSize: 13,
    color: D.text,
  },
  tag: {
    height: 20,
    paddingHorizontal: 7,
    borderRadius: 10,
    backgroundColor: D.line,
    justifyContent: "center",
  },
  tagText: { fontFamily: geist.semibold, fontSize: 11, color: D.secondary },
  relTrack: {
    width: 150,
    maxWidth: "100%",
    height: 3,
    borderRadius: 2,
    backgroundColor: D.line,
  },
  relFill: { height: 3, borderRadius: 2, backgroundColor: D.accent },
  share: { fontFamily: geist.medium, fontSize: 13, color: D.text },
  amount: { fontFamily: geist.regular, fontSize: 13, color: D.text },
  value: { fontFamily: geist.regular, fontSize: 11, color: D.muted },
  bone: { height: 10, borderRadius: 3, backgroundColor: D.line },
  empty: {
    paddingTop: 48,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: ROW_LINE,
  },
  emptyText: { fontFamily: geist.regular, fontSize: 14, color: D.secondary },
});
