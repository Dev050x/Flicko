import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BuySheet, type TradeSide } from "@/components/feed/buy-sheet";
import { PillButton } from "@/components/feed/pill-button";
import { Sparkline } from "@/components/feed/sparkline";
import { BackIcon, MoreIcon } from "@/components/markets/icons";
import { WatchStar } from "@/components/markets/watch-star";
import {
  ActivityCard,
  DetailsCard,
  PositionCard,
  Reactions,
  SafetyCard,
  StatsGrid,
  safetyRows,
} from "@/components/meme/overview-sections";
import { useToast } from "@/components/ui/toast";
import { ConnectFlow } from "@/components/wallet/connect-flow";
import { config } from "@/config";
import type { Meme } from "@/features/feed/types";
import { WINDOWS } from "@/features/markets/api";
import {
  useMemeDetail,
  useReact,
  useSafetyChecks,
  type MemeView,
  type ReactionKind,
} from "@/features/meme/api";
import { ageLong, priceSkr, shortAddress } from "@/lib/format";
import { useSession } from "@/store/session";
import { colors, fonts, market, mono } from "@/theme";
import { changeStyle } from "@/theme/priceChange";

/*
 * Meme page. The Overview tab follows MemeDetail-overview.png top to bottom: header,
 * banner, title + creator, tags, price + 24h change, sparkline, timeframe row, tabs,
 * then position / stats / activity / safety / reactions / details, with a sticky
 * Buy + Sell bar.
 */
type Tab = "overview" | "chart" | "trades" | "holders";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "chart", label: "Chart" },
  { id: "trades", label: "Trades" },
  { id: "holders", label: "Holders" },
];

const PAD = 16;
const BAR_HEIGHT = 54;
const defaultAvatar = require("../../assets/brand/flicko-pfp-dark-ring-1024.png");

/* The feed's buy sheet takes a feed Meme; build one from the page's data. */
const asFeedMeme = (m: MemeView): Meme => {
  const sale = Math.floor(m.supply * 0.8);
  return {
    id: m.mint,
    imageUrl: (m.image ?? "") as Meme["imageUrl"],
    creator: {
      wallet: m.creator.wallet,
      handle: m.creator.handle ?? shortAddress(m.creator.wallet),
      avatarUrl: defaultAvatar,
      isFollowing: false,
    },
    ticker: m.symbol,
    createdAt: m.createdAt,
    status: m.phase === "pool" ? "trading" : "launching",
    supplyTotal: sale,
    supplySold: Math.max(0, sale - Math.floor(m.saleLeft)),
    launchPrice: m.priceSkr,
    price: m.priceSkr,
    totalSupply: m.supply,
    volume24h: m.volume24hSkr,
    change24hPct: m.change["24h"],
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
  };
};

const explorerUrl = (address: string) =>
  `https://explorer.solana.com/address/${address}?cluster=${config.cluster}`;

export default function MemeDetail() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { mint } = useLocalSearchParams<{ mint: string }>();
  const client = useQueryClient();
  const detail = useMemeDetail(mint);
  const safety = useSafetyChecks(mint);
  const react = useReact(mint);
  const signedIn = useSession((s) => s.session !== null);
  const [tab, setTab] = useState<Tab>("overview");
  const [trade, setTrade] = useState<TradeSide | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [menu, setMenu] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const sectionsY = useRef(0);
  const safetyY = useRef(0);
  const { toast, show } = useToast(insets.top + 64);

  const meme = detail.data;
  const rows = useMemo(() => (meme ? safetyRows(meme, safety.data) : []), [meme, safety.data]);
  const passed = rows.filter((r) => r.ok === true).length;

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([detail.refetch(), safety.refetch()]);
    setRefreshing(false);
  }, [detail, safety]);

  const share = useCallback(() => {
    if (!meme) return;
    const url = `${config.siteUrl}/m/${meme.mint}`;
    Share.share({ message: `$${meme.symbol} on Flicko ${url}`, url }).catch(() => {});
  }, [meme]);

  // No clipboard module in the dev build yet; the share sheet offers Copy.
  const copy = useCallback((address: string) => {
    Share.share({ message: address }).catch(() => {});
  }, []);

  const explore = useCallback((address: string) => {
    Linking.openURL(explorerUrl(address)).catch(() => {});
  }, []);

  const onReact = useCallback(
    (kind: ReactionKind, on: boolean) => {
      if (!signedIn && !config.useMocks) {
        setConnecting(true);
        return;
      }
      react.mutate({ kind, on });
    },
    [react, signedIn],
  );

  const toSafety = () => {
    setTab("overview");
    requestAnimationFrame(() =>
      scroll.current?.scrollTo({
        y: Math.max(0, sectionsY.current + safetyY.current - 16),
        animated: true,
      }),
    );
  };

  const header = (
    <View style={[styles.header, { marginTop: insets.top }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/markets"))}
        style={styles.iconButton}
      >
        <BackIcon />
      </Pressable>
      <View style={styles.headerTitle}>
        {meme?.image && <Image source={meme.image} style={styles.headerThumb} contentFit="cover" />}
        {meme && (
          <Text style={styles.headerTicker} numberOfLines={1}>
            ${meme.symbol}
          </Text>
        )}
      </View>
      <WatchStar mint={mint} onSignIn={() => setConnecting(true)} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="More"
        onPress={() => setMenu(true)}
        style={styles.iconButton}
      >
        <MoreIcon />
      </Pressable>
    </View>
  );

  if (!meme) {
    return (
      <View style={styles.screen}>
        {header}
        {detail.isError ? (
          <View style={styles.center}>
            <Text style={styles.muted}>Couldn't load this meme.</Text>
            <Pressable accessibilityRole="button" onPress={() => detail.refetch()} style={styles.outline}>
              <Text style={styles.outlineText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <View>
            <View style={[styles.bone, { width, height: width * 0.6 }]} />
            <View style={{ padding: PAD, gap: 14 }}>
              <View style={[styles.bone, { width: 220, height: 26, borderRadius: 8 }]} />
              <View style={[styles.bone, { width: 260, height: 16, borderRadius: 8 }]} />
              <View style={[styles.bone, { width: 160, height: 40, borderRadius: 10, marginTop: 10 }]} />
              <View style={[styles.bone, { width: width - PAD * 2, height: 60, borderRadius: 10 }]} />
            </View>
          </View>
        )}
      </View>
    );
  }

  const change24 = changeStyle(meme.change["24h"]);
  const handle = meme.creator.handle ? `@${meme.creator.handle}` : shortAddress(meme.creator.wallet);

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView
        ref={scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: BAR_HEIGHT + insets.bottom + 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.text}
            colors={[colors.text]}
            progressBackgroundColor={colors.surfaceRaised}
          />
        }
      >
        <View style={{ width, height: width * 0.6, backgroundColor: colors.surface }}>
          {meme.image && (
            <Image source={meme.image} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
          )}
        </View>

        <View style={styles.block}>
          <Text style={styles.title}>{meme.name}</Text>
          <View style={styles.creatorLine}>
            <Image source={defaultAvatar} style={styles.creatorAvatar} />
            <Text style={styles.creatorText} numberOfLines={1}>
              by <Text style={styles.creatorHandle}>{handle}</Text> · launched {ageLong(meme.createdAt)} ago
            </Text>
          </View>

          <View style={styles.tags}>
            <View style={styles.tag}>
              <Text style={styles.tagText}>
                {meme.phase === "pool" ? "Trading in pool" : `Launching · ${Math.floor(meme.launchPct)}%`}
              </Text>
            </View>
            {meme.trendingRank !== null && (
              <View style={styles.tag}>
                <Text style={styles.tagText}>#{meme.trendingRank} trending</Text>
              </View>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${passed} of ${rows.length} safety checks passed`}
              onPress={toSafety}
              style={[styles.tag, styles.tagOutline]}
            >
              <Text style={styles.tagText}>
                {safety.data ? `${passed}/${rows.length} safety checks` : "Safety checks"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.priceLine}>
            <Text style={styles.price}>{priceSkr(meme.priceSkr)}</Text>
            <Text style={styles.priceUnit}>SKR</Text>
          </View>
          <Text style={styles.changeLine}>
            <Text style={[styles.changeValue, { color: change24.text }]}>{change24.label}</Text>
            {"  "}past 24H
          </Text>
        </View>

        <View style={styles.spark}>
          <Sparkline values={meme.sparkline} width={width - PAD * 2} height={64} color={market.spark} />
        </View>

        <View style={styles.windows}>
          {WINDOWS.map((w) => {
            const tone = changeStyle(meme.change[w]);
            return (
              <View key={w} style={styles.windowCell}>
                <Text style={styles.windowLabel}>{w.toUpperCase()}</Text>
                <Text style={[styles.windowValue, { color: tone.text }]}>{tone.label}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.tabs} accessibilityRole="tablist">
          {TABS.map((t) => {
            const on = t.id === tab;
            return (
              <Pressable
                key={t.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => setTab(t.id)}
                style={styles.tab}
              >
                <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
                {on && <View style={styles.tabLine} />}
              </Pressable>
            );
          })}
        </View>

        {tab === "overview" ? (
          <View style={styles.sections} onLayout={(e) => (sectionsY.current = e.nativeEvent.layout.y)}>
            <PositionCard meme={meme} />
            <StatsGrid meme={meme} />
            <ActivityCard meme={meme} />
            <View onLayout={(e) => (safetyY.current = e.nativeEvent.layout.y)}>
              <SafetyCard meme={meme} checks={safety.data} />
            </View>
            <Reactions meme={meme} onReact={onReact} />
            <DetailsCard meme={meme} onCopy={copy} onExplore={explore} />
          </View>
        ) : (
          <View style={styles.soon}>
            <Text style={styles.muted}>
              {TABS.find((t) => t.id === tab)?.label} is coming in the next update.
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
        <PillButton kind="accent" label="Buy" onPress={() => setTrade("buy")} style={{ flex: 1 }}>
          <Text style={styles.buyText}>Buy</Text>
        </PillButton>
        <PillButton kind="outline" label="Sell" onPress={() => setTrade("sell")} style={{ flex: 1 }}>
          <Text style={styles.sellText}>Sell</Text>
        </PillButton>
      </View>

      {menu && (
        <Modal transparent visible statusBarTranslucent onRequestClose={() => setMenu(false)}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(false)} />
          <Animated.View entering={FadeIn.duration(120)} style={[styles.menu, { top: insets.top + 52 }]}>
            {[
              { label: "Share", run: share },
              { label: "Copy token address", run: () => copy(meme.mint) },
              { label: "View on explorer", run: () => explore(meme.mint) },
            ].map((item) => (
              <Pressable
                key={item.label}
                accessibilityRole="menuitem"
                onPress={() => {
                  setMenu(false);
                  item.run();
                }}
                style={styles.menuItem}
              >
                <Text style={styles.menuText}>{item.label}</Text>
              </Pressable>
            ))}
          </Animated.View>
        </Modal>
      )}

      {trade && (
        <BuySheet
          key={trade}
          meme={asFeedMeme(meme)}
          side={trade}
          onClose={() => setTrade(null)}
          onDone={(message) => {
            setTrade(null);
            show(message);
            client.invalidateQueries({ queryKey: ["meme", mint] });
            client.invalidateQueries({ queryKey: ["market"] });
          }}
          onConnect={() => {
            setTrade(null);
            setConnecting(true);
          }}
        />
      )}
      {connecting && (
        <ConnectFlow onClose={() => setConnecting(false)} onBrowse={() => setConnecting(false)} />
      )}
      {toast}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingLeft: 44,
  },
  headerThumb: { width: 30, height: 30, borderRadius: 8 },
  headerTicker: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.text },
  block: { paddingHorizontal: PAD, paddingTop: 18 },
  title: { fontFamily: fonts.bodyBold, fontSize: 26, lineHeight: 32, color: colors.text },
  creatorLine: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  creatorAvatar: { width: 28, height: 28, borderRadius: 8 },
  creatorText: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.textMuted },
  creatorHandle: { fontFamily: fonts.bodyBold, color: colors.text },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  tag: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    backgroundColor: colors.surfaceRaised,
    justifyContent: "center",
  },
  tagOutline: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.borderStrong },
  tagText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
  priceLine: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 22 },
  price: { fontFamily: mono.medium, fontSize: 40, lineHeight: 46, color: colors.text, letterSpacing: -1 },
  priceUnit: { fontFamily: fonts.body, fontSize: 18, color: colors.textMuted },
  changeLine: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, marginTop: 4 },
  changeValue: { fontFamily: mono.medium },
  spark: { paddingHorizontal: PAD, marginTop: 18, height: 64 },
  windows: {
    flexDirection: "row",
    marginHorizontal: PAD,
    marginTop: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  windowCell: { flex: 1, alignItems: "center", gap: 4 },
  windowLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  windowValue: { fontFamily: mono.medium, fontSize: 14 },
  tabs: {
    flexDirection: "row",
    marginTop: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: { flex: 1, height: 46, alignItems: "center", justifyContent: "center" },
  tabText: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.textMuted },
  tabTextOn: { fontFamily: fonts.bodyBold, color: colors.text },
  tabLine: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -1,
    height: 2,
    backgroundColor: colors.text,
  },
  sections: { paddingHorizontal: PAD, paddingTop: 18, gap: 16 },
  soon: { paddingVertical: 60, alignItems: "center" },
  muted: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted },
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: PAD,
    paddingTop: 12,
    backgroundColor: colors.bg,
  },
  buyText: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
  sellText: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
  menu: {
    position: "absolute",
    right: 12,
    width: 220,
    padding: 6,
    borderRadius: 16,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuItem: { height: 44, borderRadius: 10, paddingHorizontal: 12, justifyContent: "center" },
  menuText: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  outline: {
    height: 42,
    paddingHorizontal: 20,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
  bone: { backgroundColor: colors.surface },
});
