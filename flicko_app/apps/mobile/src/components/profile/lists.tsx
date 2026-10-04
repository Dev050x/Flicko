import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Bone } from "@/components/profile/skeleton";
import { ChangeChip } from "@/components/ui/change-chip";
import {
  skrOf,
  type ActivityItem,
  type Holding,
  type Profile,
  type ProfileMeme,
  type PublicHolding,
} from "@/features/profile/api";
import { ageShort, compact, grouped, priceCompact } from "@/lib/format";
import { colors, mono, profile as p } from "@/theme";
import { changeStyle } from "@/theme/priceChange";

const GAP = 7;
const open = (mint: string) => router.push(`/meme/${mint}`);

/* ---------------- tabs ---------------- */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <View style={tabStyles.row} accessibilityRole="tablist">
      {tabs.map((tab) => {
        const on = tab.id === value;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(tab.id)}
            style={tabStyles.tab}
          >
            <Text style={[tabStyles.label, on && tabStyles.on]}>
              {tab.label}
            </Text>
            <View
              style={[tabStyles.bar, on && { backgroundColor: colors.text }]}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const tabStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: p.line,
  },
  tab: { flex: 1, alignItems: "center", gap: 9, paddingTop: 10 },
  label: { fontFamily: "DMSans_500Medium", fontSize: 14, color: p.muted },
  on: { fontFamily: "DMSans_700Bold", color: colors.text },
  bar: { width: "100%", height: 2, backgroundColor: "transparent" },
});

/* ---------------- shared bits ---------------- */

const Empty = ({
  text,
  action,
  onAction,
}: {
  text: string;
  action?: string;
  onAction?: () => void;
}) => (
  <View style={listStyles.empty}>
    <Text style={listStyles.emptyText}>{text}</Text>
    {action && (
      <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
        <Text style={listStyles.emptyAction}>{action}</Text>
      </Pressable>
    )}
  </View>
);

const Thumb = ({ uri, size }: { uri: string | null; size: number }) => (
  <Image
    source={uri ? { uri } : undefined}
    style={{
      width: size,
      height: size,
      borderRadius: 10,
      backgroundColor: p.card,
    }}
    contentFit="cover"
  />
);

/* ---------------- meme grid ---------------- */

export function MemeGrid({
  items,
  width,
  loading,
  emptyText,
  emptyAction,
  onEmptyAction,
}: {
  items: ProfileMeme[] | undefined;
  width: number;
  loading: boolean;
  emptyText: string;
  emptyAction?: string;
  onEmptyAction?: () => void;
}) {
  const tile = Math.floor((width - 32 - GAP * 2) / 3);
  const height = Math.round((tile * 5) / 4);
  if (loading) {
    return (
      <View style={listStyles.grid}>
        {Array.from({ length: 6 }, (_, i) => (
          <Bone key={i} width={tile} height={height} radius={12} />
        ))}
      </View>
    );
  }
  if (!items?.length) {
    return (
      <Empty text={emptyText} action={emptyAction} onAction={onEmptyAction} />
    );
  }
  return (
    <View style={listStyles.grid}>
      {items.map((m) => {
        const pct = m.priceChange24hBps / 100;
        return (
          <Pressable
            key={m.mint}
            accessibilityRole="button"
            accessibilityLabel={`$${m.symbol}, ${spokenChange(pct)}`}
            onPress={() => open(m.mint)}
            style={{
              width: tile,
              height,
              borderRadius: 12,
              overflow: "hidden",
              backgroundColor: p.card,
            }}
          >
            <Image
              source={m.imageUrl ? { uri: m.imageUrl } : undefined}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
            <View style={listStyles.tileInfo}>
              <View style={listStyles.ticker}>
                <Text style={listStyles.tickerText}>${m.symbol}</Text>
              </View>
              <ChangeChip pct={pct} size="sm" />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const spokenChange = (pct: number) =>
  pct >= 0.05
    ? `up ${Math.round(pct)} percent`
    : pct <= -0.05
      ? `down ${Math.round(Math.abs(pct))} percent`
      : "unchanged";

/* ---------------- holdings ---------------- */

export function HoldingsList({
  items,
  totalValue,
  loading,
  onExplore,
}: {
  items: Holding[] | undefined;
  totalValue: number;
  loading: boolean;
  onExplore: () => void;
}) {
  if (loading) return <Rows />;
  if (!items?.length) {
    return (
      <Empty
        text="You don't hold any memes yet"
        action="Explore markets"
        onAction={onExplore}
      />
    );
  }
  return (
    <View>
      <View style={listStyles.summary}>
        <Text style={listStyles.summaryText}>
          {items.length} {items.length === 1 ? "position" : "positions"}
        </Text>
        <Text style={listStyles.summaryText}>
          Value{" "}
          <Text style={listStyles.summaryValue}>{grouped(totalValue)}</Text>{" "}
          <Text style={listStyles.summaryValue}>SKR</Text>
        </Text>
      </View>
      {items.map((h) => {
        const amount = Number(BigInt(h.balance) / 1_000_000n);
        const avg = amount > 0 ? skrOf(h.costBasis) / amount : 0;
        return (
          <Pressable
            key={h.mint}
            accessibilityRole="button"
            accessibilityLabel={`$${h.symbol}, ${compact(amount)} tokens, worth ${grouped(skrOf(h.value))} SKR`}
            onPress={() => open(h.mint)}
            style={listStyles.holding}
          >
            <Thumb uri={h.imageUrl} size={44} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={listStyles.symbol}>${h.symbol}</Text>
              <Text style={listStyles.sub} numberOfLines={1}>
                {compact(amount)} ${h.symbol} · avg {priceCompact(avg)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <Text style={listStyles.value}>
                {skrOf(h.value) >= 100
                  ? grouped(skrOf(h.value))
                  : skrOf(h.value).toLocaleString("en-US", {
                      maximumFractionDigits: 1,
                    })}{" "}
                SKR
              </Text>
              <ChangeChip pct={h.unrealizedPnlBps / 100} size="sm" />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/* What anyone may see of another wallet's positions: picture, ticker and P&L. */
export function PublicHoldingsList({
  items,
  loading,
}: {
  items: PublicHolding[] | undefined;
  loading: boolean;
}) {
  if (loading) return <Rows />;
  if (!items?.length) return <Empty text="No memes held yet" />;
  return (
    <View>
      {items.map((h) => (
        <Pressable
          key={h.mint}
          accessibilityRole="button"
          accessibilityLabel={`$${h.symbol}, ${spokenChange(h.pnlBps / 100)}`}
          onPress={() => open(h.mint)}
          style={listStyles.holding}
        >
          <Thumb uri={h.imageUrl} size={44} />
          <Text style={[listStyles.symbol, { flex: 1 }]}>${h.symbol}</Text>
          <ChangeChip pct={h.pnlBps / 100} size="sm" />
        </Pressable>
      ))}
    </View>
  );
}

const Rows = () => (
  <View style={{ gap: 14, paddingTop: 16 }}>
    {Array.from({ length: 4 }, (_, i) => (
      <View
        key={i}
        style={{ flexDirection: "row", gap: 12, alignItems: "center" }}
      >
        <Bone width={44} height={44} radius={10} />
        <View style={{ flex: 1, gap: 6 }}>
          <Bone width={80} height={14} />
          <Bone width="60%" height={12} />
        </View>
      </View>
    ))}
  </View>
);

/* ---------------- activity ---------------- */

const ACTION: Record<ActivityItem["type"], string> = {
  buy: "Bought",
  sell: "Sold",
  launch: "Launched",
  claim: "Claimed creator fees",
};

export function ActivityList({
  items,
  loading,
}: {
  items: ActivityItem[] | undefined;
  loading: boolean;
}) {
  if (loading) return <Rows />;
  if (!items?.length) return <Empty text="No activity yet" />;
  return (
    <View>
      {items.map((a, i) => {
        const amount = skrOf(a.skr);
        return (
          <Pressable
            key={`${a.type}-${a.mint}-${a.at}-${i}`}
            accessibilityRole="button"
            disabled={a.type === "claim"}
            onPress={() => open(a.mint)}
            style={listStyles.activity}
          >
            <Text style={listStyles.activityLabel} numberOfLines={1}>
              {ACTION[a.type]}
              {a.type !== "claim" && (
                <Text style={{ fontFamily: "DMSans_700Bold" }}>
                  {" "}
                  ${a.symbol}
                </Text>
              )}
            </Text>
            <Text style={listStyles.activityValue}>
              {a.type === "launch"
                ? ""
                : `${amount >= 100 ? grouped(amount) : amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} SKR  ·  `}
              {ageShort(Date.parse(a.at))}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------------- creator stats strip (public) ---------------- */

export function CreatorStrip({ stats }: { stats: Profile["creatorStats"] }) {
  const best = stats.bestMeme;
  const tone = best ? changeStyle(best.changeBps / 100) : null;
  return (
    <View style={listStyles.strip}>
      <Stat
        label="Total volume"
        value={`${compact(skrOf(stats.totalVolume))} SKR`}
      />
      <Stat
        label="Best meme"
        value={best ? `$${best.symbol} ${tone?.label ?? ""}` : "None yet"}
      />
      <Stat
        label="Graduated"
        value={`${stats.graduated} / ${stats.launched}`}
        end
      />
    </View>
  );
}

const Stat = ({
  label,
  value,
  end,
}: {
  label: string;
  value: string;
  end?: boolean;
}) => (
  <View
    accessibilityLabel={`${label}: ${value}`}
    style={[listStyles.stat, end && { alignItems: "flex-end" }]}
  >
    <Text style={listStyles.statLabel}>{label}</Text>
    <Text style={listStyles.statValue} numberOfLines={1}>
      {value}
    </Text>
  </View>
);

const listStyles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP, paddingTop: 16 },
  tileInfo: {
    position: "absolute",
    left: 6,
    right: 6,
    bottom: 6,
    alignItems: "flex-start",
    gap: 3,
  },
  ticker: {
    height: 20,
    paddingHorizontal: 7,
    borderRadius: 10,
    backgroundColor: p.tile,
    justifyContent: "center",
  },
  tickerText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 11,
    color: colors.text,
  },
  empty: { alignItems: "center", gap: 10, paddingVertical: 48 },
  emptyText: { fontFamily: "DMSans_400Regular", fontSize: 14, color: p.muted },
  emptyAction: {
    fontFamily: "DMSans_700Bold",
    fontSize: 14,
    color: colors.text,
  },
  summary: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  summaryText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: p.muted,
  },
  summaryValue: { fontFamily: mono.medium, color: colors.text },
  holding: {
    height: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#221D2B",
  },
  symbol: { fontFamily: "DMSans_700Bold", fontSize: 16, color: colors.text },
  sub: { fontFamily: mono.medium, fontSize: 12, color: p.muted },
  value: { fontFamily: mono.medium, fontSize: 15, color: colors.text },
  activity: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#221D2B",
  },
  activityLabel: {
    flexShrink: 1,
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    color: colors.text,
  },
  activityValue: { fontFamily: mono.medium, fontSize: 13, color: p.muted },
  strip: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderRadius: 16,
    backgroundColor: p.card,
    borderWidth: 1,
    borderColor: p.line,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
  },
  stat: { flexShrink: 1, gap: 4 },
  statLabel: { fontFamily: "DMSans_400Regular", fontSize: 12, color: p.muted },
  statValue: { fontFamily: mono.medium, fontSize: 14, color: colors.text },
});
