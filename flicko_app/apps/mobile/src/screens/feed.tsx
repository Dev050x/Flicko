import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BuySheet, type TradeSide } from "@/components/feed/buy-sheet";
import { FeedPage, type FeedPageActions } from "@/components/feed/feed-page";
import { ProfileMenu, type ProfileMenuAction } from "@/components/feed/profile-menu";
import { FeedTopBar, TOP_BAR_HEIGHT } from "@/components/feed/top-bar";
import { useToast } from "@/components/ui/toast";
import { ConnectFlow } from "@/components/wallet/connect-flow";
import { WalletSheet } from "@/components/wallet/wallet-sheet";
import { config } from "@/config";
import { useFeedPages } from "@/features/feed/api";
import { useFeedStore } from "@/features/feed/store";
import type { FeedTab, Meme } from "@/features/feed/types";
import { useSession } from "@/store/session";
import { feed, geist } from "@/theme";

/*
 * The feed (flicko_feed design): one meme per page, vertical snap paging over the
 * server's feed. Only the current page and its neighbours are rendered; the next image
 * is prefetched and the next page of memes loads as you near the end.
 */
export default function Feed() {
  const insets = useSafeAreaInsets();
  const ids = useFeedStore((s) => s.ids);
  const tab = useFeedStore((s) => s.tab);
  const setTab = useFeedStore((s) => s.setTab);
  const ingest = useFeedStore((s) => s.ingest);
  const pages = useFeedPages(tab);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [current, setCurrent] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [trade, setTrade] = useState<{ meme: Meme; side: TradeSide } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [menu, setMenu] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const list = useRef<FlatList<string>>(null);
  const { toast, show } = useToast(insets.top + TOP_BAR_HEIGHT + 8);

  const loaded = useMemo(() => pages.data?.pages.flatMap((p) => p.items) ?? [], [pages.data]);
  // Following and For you share one server list, so the tab is a dependency too.
  useEffect(() => {
    ingest(loaded);
  }, [loaded, ingest, tab]);

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken<string>[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setCurrent(first.index);
  }).current;

  useEffect(() => {
    const next = ids[current + 1] && useFeedStore.getState().memes[ids[current + 1]];
    if (next && typeof next.imageUrl === "string" && next.imageUrl) Image.prefetch(next.imageUrl);
  }, [current, ids]);

  const actions = useMemo<FeedPageActions>(
    () => ({
      onRemix: (meme: Meme) => {
        // TODO: the camera doesn't take a template yet; it ignores `template` for now.
        router.navigate({ pathname: "/camera", params: { template: meme.id } });
      },
      onShare: (meme: Meme) => {
        const url = `${config.siteUrl}/m/${meme.id}`;
        Share.share({ message: `$${meme.ticker} on Flicko ${url}`, url }).catch(() => {});
      },
      onBuy: (meme: Meme) => setTrade({ meme, side: "buy" }),
      onSell: (meme: Meme) => setTrade({ meme, side: "sell" }),
    }),
    [show],
  );

  const pickTab = useCallback(
    (next: FeedTab) => {
      if (next === useFeedStore.getState().tab) return;
      setTab(next);
      setCurrent(0);
      list.current?.scrollToOffset({ offset: 0, animated: false });
    },
    [setTab],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const result = await pages.refetch();
    ingest(result.data?.pages.flatMap((p) => p.items) ?? [], true);
    setRefreshing(false);
  }, [pages, ingest]);

  const renderItem = useCallback(
    ({ item, index }: { item: string; index: number }) =>
      Math.abs(index - current) > 1 ? (
        <View style={{ width: size.width, height: size.height }} />
      ) : (
        <FeedPage
          id={item}
          width={size.width}
          height={size.height}
          active={index === current}
          actions={actions}
        />
      ),
    [actions, current, size],
  );

  const empty = pages.isLoading ? (
    <View style={[styles.empty, { height: size.height }]}>
      <ActivityIndicator color={feed.textSecondary} />
    </View>
  ) : pages.isError ? (
    <View style={[styles.empty, { height: size.height }]}>
      <Text style={styles.emptyText}>Couldn't load the feed.</Text>
      <Pressable accessibilityRole="button" onPress={() => pages.refetch()} style={styles.retry}>
        <Text style={styles.retryText}>Try again</Text>
      </Pressable>
    </View>
  ) : (
    <View style={[styles.empty, { height: size.height }]}>
      <Text style={styles.emptyText}>
        {tab === "following"
          ? "Follow creators to see their memes here."
          : tab === "launching"
            ? "Nothing launching right now."
            : "No memes yet."}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.navigate("/camera")}
        style={styles.retry}
      >
        <Text style={styles.retryText}>Snap the first one</Text>
      </Pressable>
    </View>
  );

  return (
    <View
      style={styles.screen}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize({ width, height });
      }}
    >
      {size.height > 0 && (
        <FlatList
          ref={list}
          data={ids}
          keyExtractor={(id) => id}
          renderItem={renderItem}
          extraData={current}
          pagingEnabled
          snapToInterval={size.height}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({
            length: size.height,
            offset: size.height * index,
            index,
          })}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          windowSize={3}
          removeClippedSubviews
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          onEndReachedThreshold={2}
          onEndReached={() => {
            if (pages.hasNextPage && !pages.isFetchingNextPage) pages.fetchNextPage();
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              progressViewOffset={insets.top + TOP_BAR_HEIGHT}
              tintColor={feed.text}
              colors={[feed.accent]}
              progressBackgroundColor={feed.raised}
            />
          }
          ListEmptyComponent={empty}
        />
      )}
      <FeedTopBar
        top={insets.top}
        tab={tab}
        onTab={pickTab}
        onSearch={() => router.navigate("/markets")}
        onProfile={() => setMenu(true)}
      />
      {trade && (
        <BuySheet
          key={`${trade.meme.id}-${trade.side}`}
          meme={trade.meme}
          side={trade.side}
          onClose={() => setTrade(null)}
          onDone={(message) => {
            setTrade(null);
            show(message);
          }}
          onConnect={() => {
            setTrade(null);
            setConnecting(true);
          }}
        />
      )}
      {menu && (
        <ProfileMenu
          top={insets.top + TOP_BAR_HEIGHT}
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
      {toast}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: feed.bg },
  empty: { alignItems: "center", justifyContent: "center", paddingHorizontal: 40, gap: 16 },
  emptyText: {
    fontFamily: geist.regular,
    fontSize: 15,
    color: feed.textMuted,
    textAlign: "center",
  },
  retry: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: feed.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: { fontFamily: geist.semibold, fontSize: 15, color: feed.text },
});
