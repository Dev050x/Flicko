import { Image } from "expo-image";
import { router } from "expo-router";
import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";

import {
  CheckIcon,
  ClockIcon,
  CopyIcon,
  ExternalIcon,
  WarningIcon,
} from "@/components/markets/icons";
import {
  REACTIONS,
  type MemeView,
  type ReactionKind,
  type SafetyChecks,
} from "@/features/meme/api";
import { compact, grouped, priceCompact, shortAddress } from "@/lib/format";
import { colors, detail as D, geist } from "@/theme";
import { changeStyle } from "@/theme/priceChange";

/*
 * The meme page's sections below the tabs. Containers are outlined (no fill, 8px
 * corners); numbers are Geist with tabular figures, addresses Geist Mono.
 */

/** A creator holding this share of supply or more fails the safety check. */
export const CREATOR_LIMIT_PCT = 5;

const NUM: TextStyle = { fontVariant: ["tabular-nums"] };

export function Card({
  title,
  right,
  style,
  children,
}: {
  title?: string;
  right?: ReactNode;
  style?: object;
  children: ReactNode;
}) {
  return (
    <View style={[styles.card, style]}>
      {title && (
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>{title}</Text>
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

function Row({ label, children }: { label: ReactNode; children?: ReactNode }) {
  return (
    <View style={styles.row}>
      {typeof label === "string" ? (
        <Text style={styles.rowLabel}>{label}</Text>
      ) : (
        label
      )}
      {children}
    </View>
  );
}

const signed = (n: number, format: (v: number) => string) =>
  `${n >= 0 ? "+" : "−"}${format(Math.abs(n))}`;

export function PositionCard({ meme }: { meme: MemeView }) {
  const p = meme.position;
  if (!p) return null;
  const tone = changeStyle(p.pnlPct);
  return (
    <View style={[styles.card, styles.position]}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.label}>Your position</Text>
        <Text style={[styles.positionAmount, NUM]}>
          {compact(p.tokens)} ${meme.symbol}
        </Text>
        <Text style={styles.label}>
          Avg buy <Text style={NUM}>{priceCompact(p.avgBuySkr)}</Text>
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <Text style={[styles.positionValue, NUM]}>
          {compact(p.valueSkr)} <Text style={styles.unit}>SKR</Text>
        </Text>
        <Text style={[styles.pnl, NUM, { color: tone.text }]}>
          {signed(p.pnlSkr, compact)} SKR ·{" "}
          {signed(p.pnlPct, (v) => v.toFixed(0))}%
        </Text>
      </View>
    </View>
  );
}

/* The launch sale's progress and what happens at sell-out, from the program's rules. */
export function LaunchProgressCard({ meme }: { meme: MemeView }) {
  const pct = Math.min(100, meme.launchPct);
  const poolTokens = meme.supply - meme.saleSupply;
  // The program: sell-out raises 3.2 × p0 × S and opens the pool at 16 × p0.
  const raised = 3.2 * meme.startPriceSkr * meme.supply;
  const openPrice = 16 * meme.startPriceSkr;
  return (
    <Card
      title="Launch progress"
      right={<Text style={[styles.cardTitle, NUM]}>{Math.floor(pct)}%</Text>}
    >
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      <View style={styles.progressLine}>
        <Text style={[styles.small, NUM]}>
          {compact(meme.sold)} of {compact(meme.saleSupply)} sold
        </Text>
        <Text style={[styles.small, NUM]}>{compact(meme.saleLeft)} left</Text>
      </View>
      <Text style={styles.explain}>
        When all {compact(meme.saleSupply)} sell, the other{" "}
        {compact(poolTokens)} ${meme.symbol} and the {compact(raised)} SKR
        raised go into a pool at {priceCompact(openPrice)} SKR. That liquidity
        locks forever and trading opens to everyone.
      </Text>
    </Card>
  );
}

export function StatsGrid({ meme }: { meme: MemeView }) {
  const launching = meme.phase === "launching";
  const cells: { label: string; value: string; unit?: string }[] = launching
    ? [
        { label: "Raised", value: compact(meme.raisedSkr), unit: "SKR" },
        { label: "Buyers", value: grouped(meme.buyersTotal) },
        { label: "Market cap", value: compact(meme.marketCapSkr) },
        { label: "Supply", value: compact(meme.supply) },
        { label: "In launch", value: compact(meme.saleSupply) },
        { label: "Left", value: compact(meme.saleLeft) },
      ]
    : [
        { label: "Market cap", value: compact(meme.marketCapSkr) },
        {
          label: "Liquidity",
          value: compact(meme.liquiditySkr),
          unit: "locked",
        },
        { label: "Holders", value: grouped(meme.holders) },
        { label: "Volume 24H", value: compact(meme.volume24hSkr) },
        { label: "Trades 24H", value: grouped(meme.trades24h) },
        { label: "Supply", value: compact(meme.supply) },
      ];
  return (
    <View style={{ gap: 8 }}>
      <View style={[styles.card, styles.grid]}>
        {cells.map((c, i) => (
          <View
            key={c.label}
            style={[
              styles.cell,
              i % 3 !== 2 && styles.cellRight,
              i < 3 && styles.cellBottom,
            ]}
          >
            <Text style={styles.label} numberOfLines={1}>
              {c.label}
            </Text>
            <Text style={[styles.cellValue, NUM]} numberOfLines={1}>
              {c.value}
              {c.unit && <Text style={styles.cellUnit}>{` ${c.unit}`}</Text>}
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.caption}>
        {launching
          ? "Values in SKR. Liquidity locks in the pool when the launch sells out."
          : "Values in SKR. Liquidity is locked in the pool forever."}
      </Text>
    </View>
  );
}

export function ActivityCard({ meme }: { meme: MemeView }) {
  const { buys, sells, buyers, sellers } = meme.activity;
  const total = buys + sells;
  const share = total === 0 ? 0.5 : buys / total;
  return (
    <Card
      title="Activity · 24H"
      right={
        <Text style={[styles.small, NUM]}>
          {grouped(buyers)} buyers · {grouped(sellers)} sellers
        </Text>
      }
    >
      <View style={styles.split}>
        {total === 0 ? (
          <View
            style={[styles.splitPart, { flex: 1, backgroundColor: D.track }]}
          />
        ) : (
          <>
            {buys > 0 && (
              <View
                style={[
                  styles.splitPart,
                  { flex: share, backgroundColor: colors.gain },
                ]}
              />
            )}
            {sells > 0 && (
              <View
                style={[
                  styles.splitPart,
                  { flex: 1 - share, backgroundColor: colors.loss },
                ]}
              />
            )}
          </>
        )}
      </View>
      <View style={styles.progressLine}>
        <Text style={styles.side}>
          <Text style={[NUM, { color: colors.gain }]}>{grouped(buys)}</Text>{" "}
          buys
        </Text>
        <Text style={styles.side}>
          <Text style={[NUM, { color: colors.loss }]}>{grouped(sells)}</Text>{" "}
          sells
        </Text>
      </View>
    </Card>
  );
}

export type CheckState = "ok" | "fail" | "pending" | "checking";

export const safetyRows = (
  meme: MemeView,
  checks: SafetyChecks | undefined,
) => {
  const onChain = (ok: boolean | undefined): CheckState =>
    ok === undefined ? "checking" : ok ? "ok" : "fail";
  const launching = meme.phase === "launching";
  const holdsOk = meme.creatorHoldsPct < CREATOR_LIMIT_PCT;
  const rows: { state: CheckState; claim: string; note: string }[] = [
    {
      state: onChain(checks?.mintAuthorityRevoked),
      claim: "Mint authority revoked",
      note: "Supply is fixed",
    },
    {
      state: onChain(checks?.noFreezeAuthority),
      claim: "No freeze authority",
      note: "Wallets can't be frozen",
    },
    launching
      ? { state: "pending", claim: "Liquidity locks", note: "At sellout" }
      : {
          state: onChain(checks?.liquidityLocked),
          claim: "Liquidity locked",
          note: "Forever",
        },
    {
      state: holdsOk ? "ok" : "fail",
      claim: `Creator holds ${Number(meme.creatorHoldsPct.toFixed(1))}%`,
      note: holdsOk
        ? `Below ${CREATOR_LIMIT_PCT}%`
        : `${CREATOR_LIMIT_PCT}% or more`,
    },
  ];
  return rows;
};

/** "4/4 safety checks", "3/4 safety checks · 1 pending" */
export const safetySummary = (rows: { state: CheckState }[]) => {
  if (rows.some((r) => r.state === "checking")) return "Safety checks";
  const passed = rows.filter((r) => r.state === "ok").length;
  const pending = rows.filter((r) => r.state === "pending").length;
  return `${passed}/${rows.length} safety checks${pending ? ` · ${pending} pending` : ""}`;
};

export function SafetyCard({
  meme,
  checks,
}: {
  meme: MemeView;
  checks: SafetyChecks | undefined;
}) {
  return (
    <Card
      title="Safety"
      right={<Text style={styles.small}>Checked on-chain</Text>}
    >
      {safetyRows(meme, checks).map((r) => {
        const tone =
          r.state === "fail"
            ? colors.loss
            : r.state === "ok"
              ? D.text
              : D.muted;
        return (
          <Row
            key={r.claim}
            label={
              <View style={styles.safetyLeft}>
                <View style={styles.safetyIcon}>
                  {r.state === "ok" ? (
                    <CheckIcon size={16} color={D.text} />
                  ) : r.state === "fail" ? (
                    <WarningIcon size={16} color={colors.loss} />
                  ) : r.state === "pending" ? (
                    <ClockIcon size={16} color={D.muted} />
                  ) : null}
                </View>
                <Text
                  style={[styles.safetyClaim, { color: tone }]}
                  numberOfLines={1}
                >
                  {r.claim}
                </Text>
              </View>
            }
          >
            <Text
              style={[
                styles.rowValueMuted,
                r.state === "fail" && { color: colors.loss },
              ]}
              numberOfLines={1}
            >
              {r.state === "checking" ? "Checking…" : r.note}
            </Text>
          </Row>
        );
      })}
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
    <View style={{ gap: 10 }}>
      <Text style={styles.cardTitle}>Reactions</Text>
      <View style={styles.reactions}>
        {REACTIONS.map(({ kind, emoji }) => {
          const on = meme.myReactions.includes(kind);
          const count = meme.reactions[kind];
          return (
            <Pressable
              key={kind}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${kind}, ${count}`}
              onPress={() => onReact(kind, !on)}
              style={[styles.reaction, on && styles.reactionOn]}
            >
              <Text style={styles.emoji}>{emoji}</Text>
              {count > 0 && (
                <Text style={[styles.reactionCount, NUM]}>
                  {grouped(count)}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
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
    <View style={styles.inline}>
      <Text style={styles.address}>{shortAddress(value)}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Copy address"
        hitSlop={10}
        onPress={() => onCopy(value)}
      >
        <CopyIcon size={16} color={D.muted} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open in explorer"
        hitSlop={10}
        onPress={() => onExplore(value)}
      >
        <ExternalIcon size={16} color={D.muted} />
      </Pressable>
    </View>
  );
  return (
    <Card title="Details">
      <Row label="Created">
        <Text style={styles.rowValue}>{dateLabel(meme.createdAt)}</Text>
      </Row>
      <Row label={meme.phase === "pool" ? "In pool" : "In launch"}>
        <Text style={[styles.rowValue, NUM]}>
          {compact(meme.pool.tokens)} ${meme.symbol} + {compact(meme.pool.skr)}{" "}
          SKR
        </Text>
      </Row>
      <Row label="Token address">{address(meme.mint)}</Row>
      <Row label="Pool address">{address(meme.memePda)}</Row>
      <Row label="Creator">
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: "/u/[handle]",
              params: { handle: meme.creator.wallet },
            })
          }
          hitSlop={8}
          style={styles.inline}
        >
          <Image source={meme.creator.avatar} style={styles.creatorAvatar} />
          <Text style={styles.rowValue}>
            {meme.creator.handle
              ? `@${meme.creator.handle}`
              : shortAddress(meme.creator.wallet)}
          </Text>
        </Pressable>
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: D.line,
    borderRadius: D.radius,
    padding: 14,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  cardTitle: { fontFamily: geist.semibold, fontSize: 15, color: D.text },
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: D.line,
  },
  rowLabel: { fontFamily: geist.regular, fontSize: 14, color: D.secondary },
  rowValue: { fontFamily: geist.medium, fontSize: 14, color: D.text },
  rowValueMuted: { fontFamily: geist.regular, fontSize: 13, color: D.muted },
  label: { fontFamily: geist.regular, fontSize: 13, color: D.muted },
  small: { fontFamily: geist.regular, fontSize: 13, color: D.secondary },
  unit: { fontFamily: geist.regular, fontSize: 13, color: D.muted },
  caption: { fontFamily: geist.regular, fontSize: 12, color: D.muted },
  position: {
    flexDirection: "row",
    alignItems: "center",
    borderColor: D.positionBorder,
  },
  positionAmount: { fontFamily: geist.medium, fontSize: 17, color: D.text },
  positionValue: { fontFamily: geist.medium, fontSize: 18, color: D.text },
  pnl: { fontFamily: geist.medium, fontSize: 13 },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: D.track,
    overflow: "hidden",
  },
  fill: { height: 8, borderRadius: 4, backgroundColor: D.accent },
  progressLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  explain: {
    fontFamily: geist.regular,
    fontSize: 13,
    lineHeight: 19,
    color: D.muted,
    marginTop: 12,
  },
  grid: { padding: 0, flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: "33.333%",
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 4,
  },
  cellRight: { borderRightWidth: 1, borderRightColor: D.line },
  cellBottom: { borderBottomWidth: 1, borderBottomColor: D.line },
  cellValue: { fontFamily: geist.medium, fontSize: 16, color: D.text },
  cellUnit: { fontFamily: geist.regular, fontSize: 12, color: D.muted },
  split: { flexDirection: "row", height: 8, gap: 4 },
  splitPart: { height: 8, borderRadius: 4 },
  side: { fontFamily: geist.regular, fontSize: 13, color: D.secondary },
  safetyLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  safetyIcon: { width: 18, alignItems: "center" },
  safetyClaim: { flexShrink: 1, fontFamily: geist.medium, fontSize: 14 },
  reactions: { flexDirection: "row", gap: 8 },
  reaction: {
    height: 40,
    minWidth: 52,
    paddingHorizontal: 14,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: D.line,
  },
  reactionOn: { borderColor: D.text },
  emoji: { fontSize: 16 },
  reactionCount: { fontFamily: geist.medium, fontSize: 14, color: D.text },
  inline: { flexDirection: "row", alignItems: "center", gap: 10 },
  address: { fontFamily: geist.mono, fontSize: 13, color: D.text },
  creatorAvatar: { width: 22, height: 22, borderRadius: 11 },
});
