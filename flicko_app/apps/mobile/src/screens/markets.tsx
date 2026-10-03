import { Image } from "expo-image";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProfileMenu, type ProfileMenuAction } from "@/components/feed/profile-menu";
import { ChevronDownIcon, SearchIcon, StarIcon } from "@/components/markets/icons";
import { MarketRow, MarketRowSkeleton, ROW_HEIGHT } from "@/components/markets/market-row";
import { StatsStrip } from "@/components/markets/stats-strip";
import { ConnectFlow } from "@/components/wallet/connect-flow";
import { WalletSheet } from "@/components/wallet/wallet-sheet";
import {
  useMarketList,
  useMarketStats,
  useWatchlistRows,
  WINDOWS,
  type MarketItem,
  type MarketSort,
  type MarketTab,
  type Window,
} from "@/features/markets/api";
import { useSession } from "@/store/session";
import { colors, fonts, market, mono } from "@/theme";

/*
 * Markets (Markets.html, first and last frames): ranked memes by tab, time window and
 * sort, with a 24h stats strip. Pull to refresh; refetches every 15s while visible.
 */
const TABS: { id: MarketTab; label: string }[] = [
  { id: "watchlist", label: "Watchlist" },
  { id: "trending", label: "Trending" },
  { id: "new", label: "New" },
  { id: "gainers", label: "Gainers" },
  { id: "volume", label: "Volume" },
];

const SORTS: { id: MarketSort; label: string }[] = [
  { id: "rank", label: "Rank" },
  { id: "mcap", label: "Market cap" },
  { id: "volume", label: "Volume" },
  { id: "change", label: "Change" },
  { id: "age", label: "Age" },
];

const SORT_BY: Record<Exclude<MarketSort, "rank">, (m: MarketItem, w: Window) => number> = {
  mcap: (m) => m.marketCapSkr,
  volume: (m, w) => m.volumeSkr[w],
  change: (m, w) => m.change[w],
  age: (m) => m.createdAt,
};

const defaultAvatar = require("../../assets/brand/flicko-pfp-dark-ring-1024.png");

export default function Markets() {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const params = useLocalSearchParams<{ sort?: string }>();
  const avatarUri = useSession((s) => s.avatarUri);
  const signedIn = useSession((s) => s.session !== null);

  const [tab, setTab] = useState<MarketTab>(params.sort === "gainers" ? "gainers" : "trending");
  const [window, setWindow] = useState<Window>("24h");
  const [sort, setSort] = useState<MarketSort>("rank");
  const [sortOpen, setSortOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // The camera's "pumping" pill opens Markets with ?sort=gainers.
  useEffect(() => {
    if (params.sort === "gainers") setTab("gainers");
  }, [params.sort]);

  useEffect(() => {
    const timer = setTimeout(() => setQ(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const watching = tab === "watchlist";
  const list = useMarketList(watching ? "trending" : tab, window, sort, q, focused && !watching);
  const watch = useWatchlistRows(window, focused && watching);
  const stats = useMarketStats(focused);

  const items = useMemo(() => {
    if (!watching) return list.data?.pages.flatMap((p) => p.items) ?? [];
    let rows = watch.data ?? [];
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter(
        (m) => m.symbol.toLowerCase().includes(needle) || m.name.toLowerCase().includes(needle),
      );
    }
    if (sort === "rank") return rows;
    return [...rows].sort((a, b) => SORT_BY[sort](b, window) - SORT_BY[sort](a, window));
  }, [watching, list.data, watch.data, q, sort, window]);

  const active = watching ? watch : list;
  const loading = watching ? watch.isLoading && (signedIn || watch.fetchStatus !== "idle") : list.isLoading;
  const failed = active.isError && items.length === 0;

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([active.refetch(), stats.refetch()]);
    setRefreshing(false);
  }, [active, stats]);

  const open = useCallback((mint: string) => router.push(`/meme/${mint}`), []);

  const renderItem = useCallback(
    ({ item, index }: { item: MarketItem; index: number }) => (
      <MarketRow item={item} rank={index + 1} window={window} onPress={open} />
    ),
    [open, window],
  );

  const pickTab = (next: MarketTab) => {
    setTab(next);
    setSort("rank");
  };

  const showWatchEmpty = watching && !loading && !failed && items.length === 0 && !q;

  const header = (
    <View style={[styles.header, { marginTop: insets.top + 8 }]}>
      {searching ? (
        <>
          <View style={styles.searchField}>
            <SearchIcon size={18} color={colors.textMuted} />
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder="Search memes"
              placeholderTextColor={colors.textFaint}
              style={styles.searchInput}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setSearching(false);
              setQuery("");
            }}
            hitSlop={8}
          >
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Profile menu"
            onPress={() => setMenu(true)}
            hitSlop={6}
            style={styles.avatar}
          >
            <Image
              source={avatarUri ? { uri: avatarUri } : defaultAvatar}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          </Pressable>
          <Text style={styles.title}>Markets</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search"
            onPress={() => setSearching(true)}
            style={styles.round}
          >
            <SearchIcon />
          </Pressable>
        </>
      )}
    </View>
  );

  const statsStrip = <StatsStrip stats={stats.data} />;

  const listEmpty = loading ? (
    <View>
      {Array.from({ length: 7 }, (_, i) => (
        <MarketRowSkeleton key={i} />
      ))}
    </View>
  ) : failed ? (
    <View style={styles.errorRow}>
      <Text style={styles.errorText}>Couldn't load markets.</Text>
      <Pressable accessibilityRole="button" onPress={() => active.refetch()} style={styles.outline}>
        <Text style={styles.outlineText}>Try again</Text>
      </Pressable>
    </View>
  ) : (
    <View style={styles.errorRow}>
      <Text style={styles.errorText}>{q ? `No memes match "${q}".` : "No memes here yet."}</Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabs}
      >
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <Pressable
              key={t.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => pickTab(t.id)}
              style={[styles.tab, on ? styles.tabOn : styles.tabOff]}
            >
              {t.id === "watchlist" && (
                <StarIcon size={18} filled={on} color={on ? colors.bg : colors.textMuted} />
              )}
              <Text style={[styles.tabText, on ? styles.tabTextOn : styles.tabTextOff]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {showWatchEmpty ? (
        <View style={styles.empty}>
          <StarIcon size={56} color={market.chipSelectedBorder} width={1.6} />
          <Text style={styles.emptyTitle}>Nothing on your watchlist</Text>
          <Text style={styles.emptyBody}>
            Tap the star on any meme to track its price here. We'll ping you when it moves.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => pickTab("trending")}
            style={[styles.outline, { marginTop: 12 }]}
          >
            <Text style={styles.outlineText}>Browse trending</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.controls}>
            <View style={styles.windows}>
              {WINDOWS.map((w) => {
                const on = w === window;
                return (
                  <Pressable
                    key={w}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => setWindow(w)}
                    style={[styles.window, on && styles.windowOn]}
                  >
                    <Text style={[styles.windowText, on && styles.windowTextOn]}>
                      {w.toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sort"
              onPress={() => setSortOpen(true)}
              hitSlop={8}
              style={styles.sort}
            >
              <Text style={styles.sortText}>
                Sort: {SORTS.find((s) => s.id === sort)?.label}
              </Text>
              <ChevronDownIcon />
            </Pressable>
          </View>
          <FlatList
            data={items}
            keyExtractor={(m) => m.mint}
            renderItem={renderItem}
            getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
            ListHeaderComponent={watching ? null : statsStrip}
            ListEmptyComponent={listEmpty}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onEndReachedThreshold={1}
            onEndReached={() => {
              if (!watching && list.hasNextPage && !list.isFetchingNextPage) list.fetchNextPage();
            }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refresh}
                tintColor={colors.text}
                colors={[colors.text]}
                progressBackgroundColor={colors.surfaceRaised}
              />
            }
          />
        </>
      )}

      {sortOpen && (
        <Modal transparent visible statusBarTranslucent onRequestClose={() => setSortOpen(false)}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSortOpen(false)} />
          <Animated.View
            entering={FadeIn.duration(120)}
            style={[styles.sortMenu, { top: insets.top + 8 + 40 + 12 + 34 + 12 + 30 }]}
          >
            {SORTS.map((s) => {
              const on = s.id === sort;
              return (
                <Pressable
                  key={s.id}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    setSort(s.id);
                    setSortOpen(false);
                  }}
                  style={[styles.sortItem, on && { backgroundColor: market.segment }]}
                >
                  <Text style={[styles.sortItemText, on && { color: colors.text }]}>{s.label}</Text>
                </Pressable>
              );
            })}
          </Animated.View>
        </Modal>
      )}

      {menu && (
        <ProfileMenu
          top={insets.top + 56}
          onClose={() => setMenu(false)}
          onAction={(action: ProfileMenuAction) => {
            setMenu(false);
            if (action === "profile") router.push("/me");
            else if (action === "wallet") setWalletOpen(true);
            else if (action === "connect") setConnecting(true);
            else useSession.getState().signOut();
          }}
        />
      )}
      {walletOpen && <WalletSheet onClose={() => setWalletOpen(false)} />}
      {connecting && (
        <ConnectFlow onClose={() => setConnecting(false)} onBrowse={() => setConnecting(false)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    height: 40,
    marginHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.text,
    overflow: "hidden",
  },
  title: {
    flex: 1,
    fontFamily: fonts.display,
    fontSize: 26,
    letterSpacing: -0.8,
    color: colors.text,
  },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  searchField: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    height: 40,
    padding: 0,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text,
  },
  cancel: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textMuted },
  tabsScroll: { flexGrow: 0, marginTop: 12 },
  tabs: { paddingHorizontal: 16, gap: 8 },
  tab: {
    height: 34,
    paddingHorizontal: 13,
    borderRadius: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tabOn: { backgroundColor: colors.text },
  tabOff: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabText: { fontSize: 13 },
  tabTextOn: { fontFamily: fonts.bodyBold, color: colors.bg },
  tabTextOff: { fontFamily: fonts.bodyMedium, color: colors.textMuted },
  controls: {
    marginTop: 12,
    marginHorizontal: 16,
    height: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  windows: { flexDirection: "row", gap: 4 },
  window: { height: 26, paddingHorizontal: 10, borderRadius: 13, justifyContent: "center" },
  windowOn: {
    backgroundColor: market.chipSelected,
    borderWidth: 1,
    borderColor: market.chipSelectedBorder,
  },
  windowText: { fontFamily: mono.medium, fontSize: 12, color: market.label },
  windowTextOn: { color: colors.text },
  sort: { flexDirection: "row", alignItems: "center", gap: 4 },
  sortText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
  sortMenu: {
    position: "absolute",
    right: 16,
    width: 170,
    padding: 6,
    borderRadius: 16,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortItem: { height: 40, borderRadius: 10, paddingHorizontal: 12, justifyContent: "center" },
  sortItemText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textMuted },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  empty: {
    flex: 1,
    alignItems: "center",
    paddingTop: 140,
    paddingHorizontal: 40,
    gap: 10,
  },
  emptyTitle: {
    marginTop: 14,
    fontFamily: fonts.displayBold,
    fontSize: 20,
    color: colors.text,
    textAlign: "center",
  },
  emptyBody: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 22,
    color: colors.textMuted,
    textAlign: "center",
  },
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
  errorRow: { alignItems: "center", gap: 14, paddingVertical: 48 },
  errorText: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted },
});
