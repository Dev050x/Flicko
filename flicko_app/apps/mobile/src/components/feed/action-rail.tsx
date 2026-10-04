import * as Haptics from "expo-haptics";
import { memo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { compactCount } from "@/features/feed/format";
import { feed, geist } from "@/theme";

import { LikeIcon, RemixIcon, ShareIcon } from "./icons";

/*
 * Like, Remix, Share (flicko-feed-icons, size 30) with a soft drop shadow
 * and a label under each. Liking fills the heart pink, pops it 1 → 1.25 → 1 and gives
 * a light haptic.
 */
const ICON = 30;

const shadow = {
  filter: [
    {
      dropShadow: {
        offsetX: 0,
        offsetY: 1,
        standardDeviation: 3,
        color: "rgba(0,0,0,0.5)",
      },
    },
  ],
};

function RailButton({
  label,
  text,
  icon,
  onPress,
}: {
  label: string;
  text: string;
  icon: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.item}>
      {icon}
      <Text style={styles.text}>{text}</Text>
    </Pressable>
  );
}

export const ActionRail = memo(function ActionRail({
  liked,
  likeCount,
  onLike,
  onRemix,
  onShare,
}: {
  liked: boolean;
  likeCount: number;
  onLike: () => void;
  onRemix: () => void;
  onShare: () => void;
}) {
  const pop = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return (
    <>
      <RailButton
        label={liked ? "Unlike" : "Like"}
        text={compactCount(likeCount)}
        onPress={() => {
          if (!liked) {
            pop.value = withSequence(withTiming(1.25, { duration: 90 }), withSpring(1));
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          }
          onLike();
        }}
        icon={
          <Animated.View style={[shadow, heartStyle]}>
            <LikeIcon size={ICON} filled={liked} color={liked ? feed.liked : feed.text} />
          </Animated.View>
        }
      />
      <RailButton
        label="Remix"
        text="Remix"
        onPress={onRemix}
        icon={<View style={shadow}><RemixIcon size={ICON} /></View>}
      />
      <RailButton
        label="Share"
        text="Share"
        onPress={onShare}
        icon={<View style={shadow}><ShareIcon size={ICON} /></View>}
      />
    </>
  );
});

const styles = StyleSheet.create({
  item: { minWidth: 64, minHeight: 44, alignItems: "center", gap: 3 },
  text: {
    fontFamily: geist.semibold,
    fontSize: 13,
    lineHeight: 17,
    color: feed.text,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
