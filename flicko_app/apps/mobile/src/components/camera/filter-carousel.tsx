import { Image } from "expo-image";
import { useCallback, useImperativeHandle, useRef, type Ref } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { NoFilterIcon } from "@/components/ui/icons";
import { FILTERS, matrixTint, type Filter } from "@/features/filters/catalog";
import { cam, colors } from "@/theme";

/*
 * Snapchat-style lens strip running through the shutter: 56dp thumbs 66dp apart, the
 * first neighbours pushed out to 84dp from the centre, and the item that snaps to the
 * centre growing to 62dp inside the 88dp shutter ring (no ring of its own). "Normal"
 * leaves the shutter empty.
 */
export const SHUTTER = 88;
const STEP = 66;
const NEIGHBOUR_PUSH = 84 - STEP;
const THUMB = 56;
const CENTER_THUMB = 62;

export interface FilterCarouselRef {
  scrollTo: (index: number, animated?: boolean) => void;
}

export function FilterCarousel({
  ref,
  initialIndex,
  onIndexChange,
  onShutter,
  shutterDisabled,
}: {
  ref?: Ref<FilterCarouselRef>;
  initialIndex: number;
  onIndexChange: (index: number) => void;
  onShutter: () => void;
  shutterDisabled?: boolean;
}) {
  const { width } = useWindowDimensions();
  const list = useRef<FlatList<Filter>>(null);
  const scrollX = useSharedValue(initialIndex * STEP);
  // The reaction below is created once; keep it pointing at the latest callback.
  const onIndexRef = useRef(onIndexChange);
  onIndexRef.current = onIndexChange;
  const emitIndex = useCallback((index: number) => onIndexRef.current(index), []);

  useImperativeHandle(ref, () => ({
    scrollTo: (index, animated = true) =>
      list.current?.scrollToOffset({ offset: index * STEP, animated }),
  }));

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  useAnimatedReaction(
    () =>
      Math.min(
        FILTERS.length - 1,
        Math.max(0, Math.round(scrollX.value / STEP)),
      ),
    (index, previous) => {
      if (previous !== null && index !== previous) {
        scheduleOnRN(emitIndex, index);
      }
    },
  );

  return (
    <View style={[styles.strip, { height: SHUTTER }]}>
      <Animated.FlatList
        ref={list}
        data={FILTERS}
        keyExtractor={(f) => f.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={STEP}
        decelerationRate="fast"
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({
          length: STEP,
          offset: STEP * index,
          index,
        })}
        contentContainerStyle={{ paddingHorizontal: (width - STEP) / 2 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        renderItem={({ item, index }) => (
          <Item
            filter={item}
            index={index}
            scrollX={scrollX}
            onPress={() =>
              list.current?.scrollToOffset({
                offset: index * STEP,
                animated: true,
              })
            }
          />
        )}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Take photo"
        accessibilityState={{ disabled: !!shutterDisabled }}
        disabled={shutterDisabled}
        onPress={onShutter}
        style={[styles.shutter, { left: (width - SHUTTER) / 2 }]}
      />
    </View>
  );
}

function Item({
  filter,
  index,
  scrollX,
  onPress,
}: {
  filter: Filter;
  index: number;
  scrollX: SharedValue<number>;
  onPress: () => void;
}) {
  const style = useAnimatedStyle(() => {
    const d = (index * STEP - scrollX.value) / STEP;
    const away = Math.abs(d);
    return {
      opacity:
        filter.type === "none"
          ? interpolate(away, [0, 0.6], [0, 1], Extrapolation.CLAMP)
          : 1,
      transform: [
        { translateX: Math.max(-1, Math.min(1, d)) * NEIGHBOUR_PUSH },
        {
          scale: interpolate(
            away,
            [0, 1],
            [CENTER_THUMB / THUMB, 1],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });
  const ring = useAnimatedStyle(() => ({
    opacity: interpolate(
      Math.abs((index * STEP - scrollX.value) / STEP),
      [0, 0.6],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={filter.name}
      onPress={onPress}
      style={styles.item}
    >
      <Animated.View style={[styles.thumb, style]}>
        <Thumb filter={filter} />
        <Animated.View style={[styles.ring, ring]} />
      </Animated.View>
    </Pressable>
  );
}

function Thumb({ filter }: { filter: Filter }) {
  if (filter.type === "none") {
    return (
      <View style={[StyleSheet.absoluteFill, styles.normal]}>
        <NoFilterIcon />
      </View>
    );
  }
  if (filter.thumb) {
    return (
      <Image
        source={filter.thumb}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
    );
  }
  if (filter.overlay) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.artThumb]}>
        <Image
          source={filter.overlay}
          style={styles.art}
          contentFit="contain"
        />
      </View>
    );
  }
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: filter.matrix
            ? matrixTint(filter.matrix, 1)
            : cam.glass,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  strip: { position: "absolute", left: 0, right: 0 },
  item: {
    width: STEP,
    height: SHUTTER,
    alignItems: "center",
    justifyContent: "center",
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    overflow: "hidden",
  },
  ring: {
    ...StyleSheet.absoluteFill,
    borderRadius: THUMB / 2,
    borderWidth: 2,
    borderColor: cam.thumbRing,
  },
  normal: {
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  artThumb: {
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  art: { width: "72%", height: "72%" },
  shutter: {
    position: "absolute",
    top: 0,
    width: SHUTTER,
    height: SHUTTER,
    borderRadius: SHUTTER / 2,
    borderWidth: 5,
    borderColor: colors.text,
  },
});
