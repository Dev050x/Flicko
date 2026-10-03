import { Image } from "expo-image";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { LockIcon, NoFilterIcon } from "@/components/ui/icons";
import { detectFaces, eyeCenters } from "@/features/face";
import { FILTERS, matrixTint, type Filter } from "@/features/filters/catalog";
import { approxEyes } from "@/features/filters/placement";
import { isLocked, useUnlockedFilters } from "@/features/filters/unlocks";
import { cam, colors } from "@/theme";

import { useCreateStore } from "../store";
import { panel } from "./controls";

/*
 * Filters: the camera's catalog on the still photo. Face filters look for faces in the
 * photo the first time one is picked. Premium filters can be tried; they are paid for
 * (burned) with the launch.
 */
export const NO_FACE = "Couldn't find a face, placed it for you";

export function FilterTool({ onNotice }: { onNotice: (text: string) => void }) {
  const filterId = useCreateStore((s) => s.edits.filterId);
  const change = useCreateStore((s) => s.change);
  const commit = useCreateStore((s) => s.commit);
  const unlocked = useUnlockedFilters();

  const ensureFaces = async () => {
    const { photo, faces, setFaces } = useCreateStore.getState();
    if (!photo || faces) return;
    let found: ReturnType<typeof eyeCenters>[] = [];
    try {
      found = (await detectFaces(photo.uri)).map((f) =>
        eyeCenters(f, photo.width, photo.height),
      );
    } catch (err) {
      console.warn("[create] face detection failed", err);
    }
    if (found.length === 0) {
      found = [approxEyes({ x: 0, y: 0, width: photo.width, height: photo.height })];
      onNotice(NO_FACE);
    }
    setFaces(found);
  };

  const pick = async (filter: Filter) => {
    if (filter.type === "face") await ensureFaces();
    change((e) => ({ ...e, filterId: filter.id }));
    commit();
  };

  return (
    <View style={[panel.wrap, { paddingHorizontal: 0 }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.list}>
        {FILTERS.map((f) => {
          const selected = f.id === filterId;
          return (
            <Pressable
              key={f.id}
              accessibilityRole="button"
              accessibilityLabel={f.name}
              accessibilityState={{ selected }}
              onPress={() => pick(f)}
              style={styles.item}
            >
              <View style={[styles.ring, selected && styles.ringOn]}>
                {f.type === "none" ? (
                  <View style={[styles.thumb, styles.none]}>
                    <NoFilterIcon />
                  </View>
                ) : f.thumb ? (
                  <Image source={f.thumb} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View
                    style={[
                      styles.thumb,
                      { backgroundColor: f.matrix ? matrixTint(f.matrix, 1) : colors.surface },
                    ]}
                  />
                )}
                {isLocked(f, unlocked.data) && (
                  <View style={styles.lock}>
                    <LockIcon size={11} />
                  </View>
                )}
              </View>
              <Text
                numberOfLines={1}
                style={[styles.name, selected && { color: colors.text, fontFamily: "DMSans_700Bold" }]}
              >
                {f.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={[panel.hint, { paddingHorizontal: 24 }]}>
        Premium filters are free to try. Their SKR is burned when you launch.
      </Text>
    </View>
  );
}

const THUMB = 60;

const styles = StyleSheet.create({
  list: { paddingHorizontal: 20, gap: 12 },
  item: { width: 72, alignItems: "center", gap: 6 },
  ring: {
    width: THUMB + 8,
    height: THUMB + 8,
    borderRadius: (THUMB + 8) / 2,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  ringOn: { borderColor: cam.thumbRing },
  thumb: { width: THUMB, height: THUMB, borderRadius: THUMB / 2 },
  none: {
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  lock: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: cam.glass,
    borderWidth: 1,
    borderColor: cam.glassBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontFamily: "DMSans_500Medium", fontSize: 11, color: cam.tabInactive },
});
