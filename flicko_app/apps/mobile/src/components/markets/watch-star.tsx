import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useToggleWatch, useWatchedMints } from "@/features/markets/api";
import { useSession } from "@/store/session";
import { feed } from "@/theme";

import { StarIcon } from "./icons";

/*
 * The watchlist star: 22px in a 44×44 target, outline #B9B5C4 when off, filled accent
 * when on. Toggles optimistically with a quick 0.85 squeeze; guests are sent to sign in.
 */
export function WatchStar({
  mint,
  onSignIn,
}: {
  mint: string;
  onSignIn: () => void;
}) {
  const watched = useWatchedMints();
  const toggle = useToggleWatch();
  const signedIn = useSession((s) => s.session !== null);
  const on = watched.data?.includes(mint) ?? false;
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={on ? "Remove from watchlist" : "Add to watchlist"}
      accessibilityState={{ selected: on }}
      onPress={() => {
        if (!signedIn && !watched.isSuccess) {
          onSignIn();
          return;
        }
        scale.value = withSequence(withTiming(0.85, { duration: 75 }), withTiming(1, { duration: 75 }));
        Haptics.selectionAsync().catch(() => {});
        toggle.mutate({ mint, on: !on });
      }}
      style={styles.target}
    >
      <Animated.View style={style}>
        <StarIcon size={22} filled={on} color={on ? feed.accent : feed.textSecondary} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
