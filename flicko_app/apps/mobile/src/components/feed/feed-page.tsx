import { Image } from "expo-image";
import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { useFeedStore } from "@/features/feed/store";
import type { Meme } from "@/features/feed/types";
import { feed } from "@/theme";

import { ActionRail } from "./action-rail";
import { Scrim } from "./scrim";
import { StatusCard } from "./status-card";

/*
 * One meme, full page: the photo fills the page (cover), scrims at top and bottom, the
 * action rail on the right, and the see-through info card above the tab bar. Captions
 * are baked into the image, so none are drawn here.
 */
export interface FeedPageActions {
  onRemix: (meme: Meme) => void;
  onShare: (meme: Meme) => void;
  onBuy: (meme: Meme) => void;
  onSell: (meme: Meme) => void;
}

export const FeedPage = memo(function FeedPage({
  id,
  width,
  height,
  active,
  actions,
}: {
  id: string;
  width: number;
  height: number;
  active: boolean;
  actions: FeedPageActions;
}) {
  const meme = useFeedStore((s) => s.memes[id]);
  const toggleLike = useFeedStore((s) => s.toggleLike);
  if (!meme) return <View style={{ width, height }} />;

  return (
    <View style={{ width, height, backgroundColor: feed.bg }}>
      <Image
        source={meme.imageUrl}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={0}
        recyclingKey={meme.id}
        accessibilityLabel={`$${meme.ticker} meme by @${meme.creator.handle}`}
      />
      <Scrim
        id={`top-${id}`}
        from="rgba(11,11,15,0.7)"
        to="rgba(11,11,15,0)"
        style={{ position: "absolute", left: 0, right: 0, top: 0, height: 120 }}
      />
      <Scrim
        id={`bottom-${id}`}
        from="rgba(11,11,15,0)"
        to="rgba(11,11,15,0.55)"
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: height * 0.4 }}
      />

      <View style={styles.bottom}>
        <View style={styles.rail}>
          <ActionRail
            liked={meme.likedByMe}
            likeCount={meme.likeCount}
            onLike={() => toggleLike(meme.id)}
            onRemix={() => actions.onRemix(meme)}
            onShare={() => actions.onShare(meme)}
          />
        </View>
        <StatusCard
          meme={meme}
          active={active}
          onBuy={() => actions.onBuy(meme)}
          onSell={() => actions.onSell(meme)}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  bottom: { position: "absolute", left: 12, right: 12, bottom: 12 },
  rail: { alignSelf: "flex-end", gap: 16, alignItems: "center", marginBottom: 14 },
});
