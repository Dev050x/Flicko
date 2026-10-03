import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  LinearTransition,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BuySheet, type TradeSide } from "@/components/feed/buy-sheet";
import { PillButton } from "@/components/feed/pill-button";
import { Sparkline } from "@/components/feed/sparkline";
import { BackIcon, MoreIcon } from "@/components/markets/icons";
import { WatchStar } from "@/components/markets/watch-star";
import {
  ActivityCard,
  DetailsCard,
  LaunchProgressCard,
  PositionCard,
  Reactions,
  SafetyCard,
  StatsGrid,
  safetyRows,
  safetySummary,
} from "@/components/meme/overview-sections";
import { ChartTab } from "@/components/meme/chart-tab";
import {
  TradeRow,
  TradeSheet,
  TradesFooter,
  TradesHeader,
  ROW_HEIGHT,
  isLarge,
} from "@/components/meme/trade-row";
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
import { useLiveTrades } from "@/features/meme/live";
import {
  useTrades,
  type TradeFilter,
  type TradeView,
} from "@/features/meme/tabs";
import { ageLong, priceCompact, shortAddress } from "@/lib/format";
import { useSession } from "@/store/session";
import { market, detail as D, geist } from "@/theme";
import { changeStyle } from "@/theme/priceChange";

/*
 * Meme page in two states. Launching: identity, chips, launch price, launch progress,
 * tabs, launch stats, safety (lock pending), one Buy button. Trading: identity, chips,
 * price + 24h change, sparkline, 5M-24H row, tabs, market stats, activity, Buy + Sell.
 */
type Tab = "overview" | "chart" | "trades" | "holders";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "chart", label: "Chart" },
  { id: "trades", label: "Trades" },
  { id: "holders", label: "Holders" },
];

const TRADE_FILTERS: { id: TradeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "buys", label: "Buys" },
  { id: "sells", label: "Sells" },
  { id: "mine", label: "Mine" },
];

/*
 * The page is one FlatList so the Trades tab can virtualise its rows: the top section,
 * the sticky tab bar, then either one content item or the trades card in pieces.
 */
type PageItem =
  | {
      key: string;
      kind: "top" | "tabs" | "content" | "filters" | "cardTop" | "cardBottom";
    }
  | { key: string; kind: "trade"; trade: TradeView };

// Rows below a new trade slide down to make room.
const rowSlide = LinearTransition.duration(160).easing(Easing.out(Easing.quad));

const PAD = 16;
const BUTTON = 54;
const defaultAvatar = require("../../assets/brand/flicko-pfp-dark-ring-1024.png");

/* The feed's buy sheet takes a feed Meme; build one from the page's data. */
const asFeedMeme = (m: MemeView): Meme => ({
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
  supplyTotal: Math.floor(m.saleSupply),
  supplySold: Math.floor(m.sold),
  launchPrice: m.startPriceSkr,
  price: m.priceSkr,
  totalSupply: m.supply,
  volume24h: m.volume24hSkr,
  change24hPct: m.change["24h"],
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
});

const explorerUrl = (address: string) =>
  `https://explorer.solana.com/address/${address}?cluster=${config.cluster}`;

export default function MemeDetail() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { mint } = useLocalSearchParams<{ mint: string }>();
  const client = useQueryClient();
  const detail = useMemeDetail(mint);
  const safety = useSafetyChecks(mint);
  const react = useReact(mint);
  const signedIn = useSession((s) => s.session !== null);
  const wallet = useSession((s) => s.session?.wallet);
  const [tab, setTab] = useState<Tab>("overview");
  const [trade, setTrade] = useState<TradeSide | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [menu, setMenu] = useState(false);
  const [viewer, setViewer] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const list = useRef<FlatList<PageItem>>(null);
  const sectionsY = useRef(0);
  /** where the tab bar starts (the top section's height) */
  const tabsY = useRef(0);
  const tabsH = useRef(66);
  const scrollY = useRef(0);
  const downRef = useRef(false);
  const [scrolledDown, setScrolledDown] = useState(false);
  const [touching, setTouching] = useState(false);
  const [filter, setFilter] = useState<TradeFilter>("all");
  const [sheet, setSheet] = useState<TradeView | null>(null);
  const safetyY = useRef(0);
  const { toast, show } = useToast(insets.top + 64);

  const meme = detail.data;

  // Trades tab: polled pages, de-duplicated, then fed through the live inserter.
  const tradesQ = useTrades(mint, tab === "trades", filter, wallet);
  const tradeSource = useMemo(() => {
    const seen = new Set<string>();
    const out: TradeView[] = [];
    for (const page of tradesQ.data?.pages ?? []) {
      for (const t of page.items) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          out.push(t);
        }
      }
    }
    return out;
  }, [tradesQ.data]);
  const live = useLiveTrades(tradeSource, scrolledDown || touching, filter);
  const largeSkr = tradesQ.data?.pages[0]?.largeSkr ?? null;

  const items = useMemo<PageItem[]>(
    () =>
      tab === "trades"
        ? [
            { key: "top", kind: "top" },
            { key: "tabs", kind: "tabs" },
            { key: "filters", kind: "filters" },
            { key: "cardTop", kind: "cardTop" },
            ...live.rows.map((trade) => ({
              key: trade.id,
              kind: "trade" as const,
              trade,
            })),
            { key: "cardBottom", kind: "cardBottom" },
          ]
        : [
            { key: "top", kind: "top" },
            { key: "tabs", kind: "tabs" },
            { key: `content-${tab}`, kind: "content" },
          ],
    [tab, live.rows],
  );

  const onScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      const y = e.nativeEvent.contentOffset.y;
      scrollY.current = y;
      const down = y > tabsY.current + 8;
      if (down !== downRef.current) {
        downRef.current = down;
        setScrolledDown(down);
      }
    },
    [],
  );
  const summary = useMemo(
    () =>
      meme ? safetySummary(safetyRows(meme, safety.data)) : "Safety checks",
    [meme, safety.data],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([detail.refetch(), safety.refetch()]);
    setRefreshing(false);
  }, [detail, safety]);

  const share = useCallback(() => {
    if (!meme) return;
    const url = `${config.siteUrl}/m/${meme.mint}`;
    Share.share({ message: `$${meme.symbol} on Flicko ${url}`, url }).catch(
      () => {},
    );
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

  /* Switch tabs without moving the page: if the tab bar is pinned, stay pinned. */
  const pickTab = (next: Tab) => {
    setTab(next);
    if (scrollY.current > tabsY.current) {
      requestAnimationFrame(() =>
        list.current?.scrollToOffset({
          offset: tabsY.current,
          animated: false,
        }),
      );
    }
  };

  const toSafety = () => {
    setTab("overview");
    // The sticky tab bar covers the content's first tabsH pixels.
    requestAnimationFrame(() =>
      list.current?.scrollToOffset({
        offset: Math.max(
          0,
          tabsY.current + sectionsY.current + safetyY.current - 16,
        ),
        animated: true,
      }),
    );
  };

  const header = (
    <View style={[styles.header, { marginTop: insets.top }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace("/markets")
        }
        style={styles.iconButton}
      >
        <BackIcon color={D.text} />
      </Pressable>
      <View style={styles.headerTitle}>
        {meme?.image && (
          <Image
            source={meme.image}
            style={styles.headerThumb}
            contentFit="cover"
          />
        )}
        <Text style={styles.headerTicker} numberOfLines={1}>
          {meme ? `$${meme.symbol}` : ""}
        </Text>
      </View>
      <WatchStar mint={mint} onSignIn={() => setConnecting(true)} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="More"
        onPress={() => setMenu(true)}
        style={styles.iconButton}
      >
        <MoreIcon color={D.text} />
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
            <Pressable
              accessibilityRole="button"
              onPress={() => detail.refetch()}
              style={styles.outline}
            >
              <Text style={styles.outlineText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ padding: PAD, gap: 16 }}>
            <View style={{ flexDirection: "row", gap: 14 }}>
              <View
                style={[
                  styles.bone,
                  { width: 64, height: 64, borderRadius: 14 },
                ]}
              />
              <View style={{ gap: 10, justifyContent: "center" }}>
                <View style={[styles.bone, { width: 180, height: 18 }]} />
                <View style={[styles.bone, { width: 220, height: 12 }]} />
              </View>
            </View>
            <View style={[styles.bone, { width: 150, height: 36 }]} />
            <View
              style={[styles.bone, { width: width - PAD * 2, height: 120 }]}
            />
          </View>
        )}
      </View>
    );
  }

  const launching = meme.phase === "launching";
  const change24 = changeStyle(meme.change["24h"]);
  const handle = meme.creator.handle
    ? `@${meme.creator.handle}`
    : shortAddress(meme.creator.wallet);
  const barHeight = launching ? BUTTON + 26 : BUTTON;
  const tabMinHeight =
    height - insets.top - 56 - tabsH.current - barHeight - insets.bottom;
  const renderKey = `${tab}|${filter}|${live.fresh}|${largeSkr}|${refreshing}|${safety.dataUpdatedAt}|${detail.dataUpdatedAt}`;

  const topContent = (
    <View onLayout={(e) => (tabsY.current = e.nativeEvent.layout.height)}>
      <View style={styles.identity}>
        <Pressable
          accessibilityRole="imagebutton"
          accessibilityLabel="Open the meme"
          onPress={() => meme.image && setViewer(true)}
          style={styles.thumb}
        >
          {meme.image && (
            <Image
              source={meme.image}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          )}
        </Pressable>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.title} numberOfLines={2}>
            {meme.name}
          </Text>
          <Text style={styles.byline} numberOfLines={1}>
            by <Text style={styles.handle}>{handle}</Text> · launched{" "}
            {ageLong(meme.createdAt)} ago
          </Text>
        </View>
      </View>

      <View style={styles.chips}>
        {launching ? (
          <View style={[styles.chip, styles.chipLime]}>
            <Text style={[styles.chipText, { color: D.lime }]}>Launching</Text>
          </View>
        ) : (
          <View style={styles.chip}>
            <Text style={styles.chipText}>Trading</Text>
          </View>
        )}
        {!launching && meme.trendingRank !== null && (
          <View style={styles.chip}>
            <Text style={styles.chipText}>#{meme.trendingRank} trending</Text>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={summary}
          onPress={toSafety}
          style={styles.chip}
        >
          <Text style={styles.chipText}>{summary}</Text>
        </Pressable>
      </View>

      <View style={styles.priceBlock}>
        <View
          style={styles.priceLine}
          accessible
          accessibilityLabel={`${meme.priceSkr} SKR`}
        >
          <Text style={styles.price}>{priceCompact(meme.priceSkr)}</Text>
          <Text style={styles.priceUnit}>SKR</Text>
        </View>
        {launching ? (
          <Text style={styles.priceNote}>Launch price · rises as it sells</Text>
        ) : (
          <Text style={styles.priceNote}>
            <Text style={[styles.tabular, { color: change24.text }]}>
              {change24.label}
            </Text>{" "}
            past 24H
          </Text>
        )}
      </View>

      {launching ? (
        <View style={{ paddingHorizontal: PAD, marginTop: 20 }}>
          <LaunchProgressCard meme={meme} />
        </View>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open the chart"
            onPress={() => pickTab("chart")}
            style={styles.spark}
          >
            <Sparkline
              values={meme.sparkline}
              width={width - PAD * 2}
              height={64}
              color={market.spark}
            />
          </Pressable>
          <View style={styles.windows}>
            {WINDOWS.map((w) => {
              const tone = changeStyle(meme.change[w]);
              return (
                <View key={w} style={styles.windowCell}>
                  <Text style={styles.windowLabel}>{w.toUpperCase()}</Text>
                  <Text style={[styles.windowValue, { color: tone.text }]}>
                    {tone.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </>
      )}
    </View>
  );

  const tabBar = (
    <View
      style={styles.tabsSticky}
      onLayout={(e) => (tabsH.current = e.nativeEvent.layout.height)}
    >
      <View style={styles.tabs} accessibilityRole="tablist">
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <Pressable
              key={t.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => pickTab(t.id)}
              style={styles.tab}
            >
              <Text style={[styles.tabText, on && styles.tabTextOn]}>
                {t.label}
              </Text>
              {on && <View style={styles.tabLine} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const tabContent = (
    <View
      style={{
        minHeight: tabMinHeight,
      }}
    >
      {tab === "overview" ? (
        <View
          style={styles.sections}
          onLayout={(e) => (sectionsY.current = e.nativeEvent.layout.y)}
        >
          <PositionCard meme={meme} />
          <StatsGrid meme={meme} />
          {!launching && <ActivityCard meme={meme} />}
          <View onLayout={(e) => (safetyY.current = e.nativeEvent.layout.y)}>
            <SafetyCard meme={meme} checks={safety.data} />
          </View>
          <Reactions meme={meme} onReact={onReact} />
          <DetailsCard meme={meme} onCopy={copy} onExplore={explore} />
        </View>
      ) : tab === "chart" ? (
        <View style={{ paddingTop: 16 }}>
          <ChartTab
            meme={meme}
            width={width}
            wallet={wallet}
            bottomInset={insets.bottom}
            onSeeAll={() => pickTab("trades")}
          />
        </View>
      ) : (
        <View style={styles.soon}>
          <Text style={styles.muted}>
            {TABS.find((t) => t.id === tab)?.label} is coming in the next
            update.
          </Text>
        </View>
      )}
    </View>
  );

  const tradesLaunching = launching;
  const renderItem = ({ item }: { item: PageItem }) => {
    switch (item.kind) {
      case "top":
        return topContent;
      case "tabs":
        return tabBar;
      case "content":
        return tabContent;
      case "filters":
        return (
          <View style={styles.filters}>
            {TRADE_FILTERS.filter(
              (f) => !(tradesLaunching && f.id === "sells"),
            ).map((f) => {
              const on = f.id === filter;
              return (
                <Pressable
                  key={f.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    if (f.id === "mine" && !wallet) {
                      setConnecting(true);
                      return;
                    }
                    setFilter(f.id);
                  }}
                  style={[styles.filterChip, on && styles.filterChipOn]}
                >
                  <Text style={[styles.filterText, on && styles.filterTextOn]}>
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        );
      case "cardTop":
        return (
          <View style={styles.cardSide}>
            <TradesHeader symbol={meme.symbol} launching={tradesLaunching} />
          </View>
        );
      case "trade":
        return (
          <View style={styles.cardSide}>
            <TradeRow
              trade={item.trade}
              symbol={meme.symbol}
              large={isLarge(item.trade, largeSkr)}
              mine={!!wallet && item.trade.wallet === wallet}
              creator={item.trade.wallet === meme.creator.wallet}
              flash={item.trade.id === live.fresh}
              onPress={setSheet}
            />
          </View>
        );
      case "cardBottom":
        return (
          <View
            style={[
              styles.cardSide,
              // fill the screen below the rows so switching tabs never jumps
              {
                minHeight: Math.max(
                  0,
                  tabMinHeight - 88 - live.rows.length * ROW_HEIGHT,
                ),
              },
            ]}
          >
            <TradesFooter
              state={
                tradesQ.isLoading
                  ? "loading"
                  : live.rows.length === 0
                    ? "empty"
                    : "rows"
              }
            />
          </View>
        );
    }
  };

  return (
    <View style={styles.screen}>
      {header}
      <Animated.FlatList
        ref={list}
        data={items}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        extraData={renderKey}
        stickyHeaderIndices={[1]}
        itemLayoutAnimation={tab === "trades" ? rowSlide : undefined}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: barHeight + insets.bottom + 36,
        }}
        scrollEventThrottle={32}
        onScroll={onScroll}
        onTouchStart={() => tab === "trades" && setTouching(true)}
        onTouchEnd={() => setTouching(false)}
        onTouchCancel={() => setTouching(false)}
        onEndReachedThreshold={1.5}
        onEndReached={() => {
          if (
            tab === "trades" &&
            tradesQ.hasNextPage &&
            !tradesQ.isFetchingNextPage
          ) {
            tradesQ.fetchNextPage();
          }
        }}
        initialNumToRender={12}
        windowSize={9}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={D.text}
            colors={[D.text]}
            progressBackgroundColor={D.track}
          />
        }
      />
      {tab === "trades" && live.pending > 0 && (
        <View
          pointerEvents="box-none"
          style={[styles.pillRow, { top: insets.top + 56 + tabsH.current + 8 }]}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              list.current?.scrollToOffset({
                offset: tabsY.current,
                animated: true,
              });
              live.resume();
            }}
            style={styles.newPill}
          >
            <Text style={styles.newPillText}>
              {live.pending} new trade{live.pending === 1 ? "" : "s"}
            </Text>
          </Pressable>
        </View>
      )}

      <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
        {launching ? (
          <View style={{ flex: 1, gap: 8 }}>
            <PillButton
              kind="accent"
              label="Buy at launch price"
              onPress={() => setTrade("buy")}
            >
              <Text style={styles.buttonText}>Buy at launch price</Text>
            </PillButton>
            <Text style={styles.barNote}>
              Trading in the pool opens when the launch sells out
            </Text>
          </View>
        ) : (
          <>
            <PillButton
              kind="accent"
              label="Buy"
              onPress={() => setTrade("buy")}
              style={{ flex: 1 }}
            >
              <Text style={styles.buttonText}>Buy</Text>
            </PillButton>
            <PillButton
              kind="outline"
              label="Sell"
              onPress={() => setTrade("sell")}
              style={{ flex: 1 }}
            >
              <Text style={styles.buttonText}>Sell</Text>
            </PillButton>
          </>
        )}
      </View>

      {viewer && meme.image && (
        <Modal
          visible
          transparent
          statusBarTranslucent
          animationType="fade"
          onRequestClose={() => setViewer(false)}
        >
          <Pressable
            accessibilityLabel="Close"
            onPress={() => setViewer(false)}
            style={styles.viewer}
          >
            <Image
              source={meme.image}
              style={{ width, height }}
              contentFit="contain"
            />
          </Pressable>
        </Modal>
      )}

      {menu && (
        <Modal
          transparent
          visible
          statusBarTranslucent
          onRequestClose={() => setMenu(false)}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setMenu(false)}
          />
          <Animated.View
            entering={FadeIn.duration(120)}
            style={[styles.menu, { top: insets.top + 52 }]}
          >
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
        <ConnectFlow
          onClose={() => setConnecting(false)}
          onBrowse={() => setConnecting(false)}
        />
      )}
      {sheet && meme && (
        <TradeSheet
          trade={sheet}
          symbol={meme.symbol}
          bottomInset={insets.bottom}
          onClose={() => setSheet(null)}
        />
      )}
      {toast}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: D.bg },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    paddingLeft: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  headerThumb: { width: 26, height: 26, borderRadius: 6 },
  headerTicker: { fontFamily: geist.semibold, fontSize: 17, color: D.text },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: PAD,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: D.track,
  },
  title: {
    fontFamily: geist.semibold,
    fontSize: 19,
    lineHeight: 24,
    color: D.text,
  },
  byline: { fontFamily: geist.regular, fontSize: 13, color: D.secondary },
  handle: { fontFamily: geist.semibold, color: D.text },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: PAD,
  },
  chip: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: D.line,
    justifyContent: "center",
  },
  chipLime: { borderColor: D.limeBorder },
  chipText: { fontFamily: geist.medium, fontSize: 13, color: D.text },
  priceBlock: { paddingHorizontal: PAD, marginTop: 20, gap: 4 },
  priceLine: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  price: {
    fontFamily: geist.semibold,
    fontSize: 32,
    lineHeight: 38,
    color: D.text,
    fontVariant: ["tabular-nums"],
  },
  priceUnit: { fontFamily: geist.regular, fontSize: 15, color: D.muted },
  priceNote: { fontFamily: geist.regular, fontSize: 13, color: D.muted },
  tabular: { fontFamily: geist.medium, fontVariant: ["tabular-nums"] },
  spark: { paddingHorizontal: PAD, marginTop: 18, height: 64 },
  windows: {
    flexDirection: "row",
    marginHorizontal: PAD,
    marginTop: 18,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: D.line,
  },
  windowCell: { flex: 1, alignItems: "center", gap: 4 },
  windowLabel: { fontFamily: geist.regular, fontSize: 12, color: D.muted },
  windowValue: {
    fontFamily: geist.medium,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
  tabsSticky: { marginTop: 20, backgroundColor: D.bg },
  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: D.line,
  },
  tab: { flex: 1, height: 46, alignItems: "center", justifyContent: "center" },
  tabText: { fontFamily: geist.medium, fontSize: 15, color: D.muted },
  tabTextOn: { fontFamily: geist.semibold, color: D.text },
  tabLine: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -1,
    height: 2,
    backgroundColor: D.text,
  },
  sections: { paddingHorizontal: PAD, paddingTop: 16, gap: 12 },
  soon: { paddingVertical: 60, alignItems: "center" },
  muted: { fontFamily: geist.regular, fontSize: 14, color: D.muted },
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: PAD,
    paddingTop: 12,
    backgroundColor: D.bg,
  },
  buttonText: { fontFamily: geist.semibold, fontSize: 17, color: D.text },
  barNote: {
    fontFamily: geist.regular,
    fontSize: 12,
    color: D.muted,
    textAlign: "center",
  },
  viewer: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  menu: {
    position: "absolute",
    right: 12,
    width: 220,
    padding: 6,
    borderRadius: D.radius,
    backgroundColor: D.bg,
    borderWidth: 1,
    borderColor: D.line,
  },
  menuItem: {
    height: 44,
    borderRadius: 6,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  menuText: { fontFamily: geist.medium, fontSize: 15, color: D.text },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  outline: {
    height: 42,
    paddingHorizontal: 20,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: D.line,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineText: { fontFamily: geist.semibold, fontSize: 14, color: D.text },
  bone: { backgroundColor: D.track, borderRadius: 6 },
  filters: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: PAD,
    paddingTop: 16,
    paddingBottom: 12,
  },
  filterChip: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: D.line,
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipOn: { backgroundColor: D.chipOn, borderColor: D.chipOn },
  filterText: { fontFamily: geist.medium, fontSize: 13, color: D.secondary },
  filterTextOn: { color: D.bg },
  cardSide: { paddingHorizontal: PAD },
  pillRow: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  newPill: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: D.chipOn,
    justifyContent: "center",
  },
  newPillText: { fontFamily: geist.semibold, fontSize: 13, color: D.bg },
});
