import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Share,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BuySheet, type TradeSide } from "@/components/feed/buy-sheet";
import { FeedPage, type FeedPageActions } from "@/components/feed/feed-page";
import { FeedTopBar } from "@/components/feed/top-bar";
import { config } from "@/config";
import { useFeedStore } from "@/features/feed/store";
import type { Meme } from "@/features/feed/types";
import { feed, geist } from "@/theme";

/*
 * The feed (flicko_feed design): one meme per page, vertical snap paging. Only the
 * current page and its neighbours are rendered; the next image is prefetched.
 */
export default function Feed() {
  const insets = useSafeAreaInsets();
  const ids = useFeedStore((s) => s.ids);
  const tab = useFeedStore((s) => s.tab);
  const setTab = useFeedStore((s) => s.setTab);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [current, setCurrent] = useState(0);
  const list = useRef<FlatList<string>>(null);
  const [trade, setTrade] = useState<{ meme: Meme; side: TradeSide } | null>(null);

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken<string>[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setCurrent(first.index);
  }).current;

  // Prefetch the next page's image (remote images only; bundled ones are already local).
  useEffect(() => {
    const next = ids[current + 1] && useFeedStore.getState().memes[ids[current + 1]];
    if (next && typeof next.imageUrl === "string") Image.prefetch(next.imageUrl);
  }, [current, ids]);

  const actions = useMemo<FeedPageActions>(
    () => ({
      onRemix: (meme: Meme) => {
        // TODO: the camera doesn't take a template yet; it ignores `template` for now.
        router.push({ pathname: "/camera", params: { template: meme.id } });
      },
      onShare: (meme: Meme) => {
        const url = `${config.siteUrl}/m/${meme.id}`;
        Share.share({ message: `$${meme.ticker} on Flicko ${url}`, url }).catch(() => {});
      },
      onBuy: (meme: Meme) => setTrade({ meme, side: "buy" }),
      onSell: (meme: Meme) => setTrade({ meme, side: "sell" }),
    }),
    [],
  );

  const pickTab = useCallback(
    (next: typeof tab) => {
      setTab(next);
      setCurrent(0);
      list.current?.scrollToOffset({ offset: 0, animated: false });
    },
    [setTab],
  );

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
          ListEmptyComponent={
            <View style={[styles.empty, { height: size.height }]}>
              <Text style={styles.emptyText}>
                {tab === "following"
                  ? "Follow creators to see their memes here."
                  : "Nothing launching right now."}
              </Text>
            </View>
          }
        />
      )}
      <FeedTopBar
        top={insets.top}
        tab={tab}
        onTab={pickTab}
        onSearch={() => router.navigate("/markets")}
      />
      {trade && (
        <BuySheet
          key={`${trade.meme.id}-${trade.side}`}
          meme={trade.meme}
          side={trade.side}
          onClose={() => setTrade(null)}
          onApprove={(order) => {
            // Milestone 3: build and sign the trade through MWA.
            console.log("[feed] order", JSON.stringify(order));
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: feed.bg },
  empty: { alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  emptyText: {
    fontFamily: geist.regular,
    fontSize: 15,
    color: feed.textMuted,
    textAlign: "center",
  },
});
