import { Image } from "expo-image";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ago, duration, skr } from "@/features/feed/format";
import { useFeedStore } from "@/features/feed/store";
import type { Meme } from "@/features/feed/types";
import { feed, geist } from "@/theme";

import { ActionRail } from "./action-rail";
import { PillButton } from "./pill-button";
import { Scrim } from "./scrim";
import { StatusCard } from "./status-card";

/*
 * One meme, full screen (flicko_feed design): the photo fills the page, with the info
 * block over its lower part: creator + follow, ticker, the see-through status card and
 * buy (launching) or buy/sell (trading); the action rail sits above it on the right.
 *
 * The photo covers the whole page above the tab bar; its caption is baked into it.
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
  const toggleFollow = useFeedStore((s) => s.toggleFollow);
  if (!meme) return <View style={{ width, height }} />;
  const launching = meme.status === "launching";

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
        color={feed.bg}
        from={0.7}
        to={0}
        style={{ position: "absolute", left: 0, right: 0, top: 0, height: 120 }}
      />
      <Scrim
        id={`bottom-${id}`}
        color={feed.bg}
        from={0}
        to={0.85}
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: height * 0.5 }}
      />

      <View style={styles.info}>
        <View style={styles.details}>
          <View>
            <View style={styles.rail}>
              <ActionRail
                liked={meme.likedByMe}
                likeCount={meme.likeCount}
                onLike={() => toggleLike(meme.id)}
                onRemix={() => actions.onRemix(meme)}
                onShare={() => actions.onShare(meme)}
              />
            </View>
            <View style={styles.creator}>
              <View style={styles.avatarRing}>
                <Image source={meme.creator.avatarUrl} style={styles.avatar} contentFit="cover" />
              </View>
              <Text style={styles.handle} numberOfLines={1}>
                @{meme.creator.handle}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${meme.creator.isFollowing ? "Unfollow" : "Follow"} @${meme.creator.handle}`}
                onPress={() => toggleFollow(meme.creator.wallet)}
                hitSlop={8}
                style={[styles.follow, meme.creator.isFollowing && styles.following]}
              >
                <Text style={styles.followText}>{meme.creator.isFollowing ? "Following" : "Follow"}</Text>
              </Pressable>
            </View>
            <View style={styles.tickerRow}>
              <Text style={styles.ticker} numberOfLines={1}>
                ${meme.ticker}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {launching
                  ? `launched ${ago(meme.createdAt)}`
                  : meme.soldOutDurationMin
                    ? `sold out in ${duration(meme.soldOutDurationMin)}`
                    : "sold out"}
              </Text>
            </View>
          </View>
          <StatusCard meme={meme} active={active} />
        </View>

        {launching ? (
          <PillButton
            kind="accent"
            label={`Buy $${meme.ticker} at ${skr(meme.price)}`}
            onPress={() => actions.onBuy(meme)}
          >
            <Text style={styles.ctaText} numberOfLines={1}>
              Buy ${meme.ticker}
              <Text style={styles.ctaDot}>{"  ·  "}</Text>
              <Text style={styles.ctaPrice}>{skr(meme.price)}</Text>
            </Text>
          </PillButton>
        ) : (
          <View style={styles.ctaRow}>
            <PillButton
              kind="accent"
              label={`Buy $${meme.ticker}`}
              onPress={() => actions.onBuy(meme)}
              style={styles.half}
            >
              <Text style={styles.ctaText}>Buy</Text>
            </PillButton>
            <PillButton
              kind="outline"
              label={`Sell $${meme.ticker}`}
              onPress={() => actions.onSell(meme)}
              style={styles.half}
            >
              <Text style={styles.ctaText}>Sell</Text>
            </PillButton>
          </View>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  info: { position: "absolute", left: 16, right: 16, bottom: 16, gap: 12 },
  rail: { position: "absolute", right: -10, bottom: 8, gap: 18, alignItems: "center" },
  details: { gap: 12 },
  creator: { flexDirection: "row", alignItems: "center", gap: 10, paddingRight: 80 },
  avatarRing: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: feed.accent,
    overflow: "hidden",
  },
  avatar: { flex: 1 },
  handle: {
    flexShrink: 1,
    fontFamily: geist.semibold,
    fontSize: 15,
    color: feed.text,
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  follow: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: feed.text,
    alignItems: "center",
    justifyContent: "center",
  },
  following: { backgroundColor: feed.raised, borderColor: feed.borderStrong },
  followText: { fontFamily: geist.semibold, fontSize: 13, color: feed.text },
  tickerRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
    marginTop: 6,
    marginBottom: 4,
    paddingRight: 80,
  },
  ticker: {
    flexShrink: 1,
    fontFamily: geist.semibold,
    fontSize: 30,
    lineHeight: 38,
    color: feed.text,
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  sub: { flexShrink: 1, fontFamily: geist.regular, fontSize: 14, color: feed.textSecondary },
  ctaRow: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  ctaText: { fontFamily: geist.semibold, fontSize: 16, color: feed.text },
  ctaDot: { fontFamily: geist.regular },
  ctaPrice: { fontFamily: geist.medium, fontSize: 15, fontVariant: ["tabular-nums"] },
});
