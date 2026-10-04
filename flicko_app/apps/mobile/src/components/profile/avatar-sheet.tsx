import { Image } from "expo-image";
import { useState, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { Button } from "@/components/ui/button";
import {
  CameraIcon,
  CheckIcon,
  ChevronRightIcon,
  GalleryIcon,
  TrashIcon,
} from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";
import { AVATARS, avatarById, type AvatarId } from "@/features/avatars/catalog";
import { colors, radius, ref } from "@/theme";

const COLUMNS = 4;

/*
 * Profile picture sheet (design-reference/ProfileSetup "Profile picture sheet"): current
 * picture beside the title, a grid of characters, then rows to snap or upload your own.
 * Picking a character or removing the photo is a draft until Save; snapping and uploading
 * leave the sheet straight away since they hand off to the camera / system picker.
 */
export function AvatarSheet({
  photoUri,
  avatarId,
  onSave,
  onSnap,
  onGallery,
  onClose,
}: {
  photoUri: string | null;
  avatarId: string | null;
  /** `id` is the chosen character; null keeps the photo. */
  onSave: (id: AvatarId | null) => void;
  onSnap: () => void;
  onGallery: () => void;
  onClose: () => void;
}) {
  const { height: screen, width } = useWindowDimensions();
  const [draft, setDraft] = useState<AvatarId | null>(
    photoUri ? null : (avatarById(avatarId)?.id ?? AVATARS[0].id),
  );
  // Where "Remove photo" falls back to.
  const fallback = avatarById(avatarId)?.id ?? AVATARS[0].id;
  const hasPhoto = draft === null && !!photoUri;
  const current = draft ? avatarById(draft) : null;
  const cell = (width - 48) / COLUMNS;

  return (
    <Sheet
      height={Math.min(screen * 0.94, hasPhoto ? 696 : 632)}
      onClose={onClose}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Image
            source={current ? current.source : { uri: photoUri! }}
            style={styles.preview}
            contentFit="cover"
          />
          <View style={styles.headerText}>
            <Text style={styles.title}>Profile picture</Text>
            <Text style={styles.subtitle}>
              {current ? current.name : "Your photo"}
            </Text>
          </View>
        </View>

        <Text style={styles.section}>PICK A CHARACTER</Text>
        <View style={styles.grid}>
          {AVATARS.map((a) => {
            const on = draft === a.id;
            return (
              <Pressable
                key={a.id}
                accessibilityRole="button"
                accessibilityLabel={a.name}
                accessibilityState={{ selected: on }}
                onPress={() => setDraft(a.id)}
                style={[styles.cell, { width: cell }]}
              >
                <View style={[styles.face, on && styles.faceOn]}>
                  <Image
                    source={a.source}
                    style={styles.faceImage}
                    contentFit="cover"
                  />
                  {on && (
                    <View style={styles.tick}>
                      <CheckIcon size={12} color={colors.bg} />
                    </View>
                  )}
                </View>
                <Text
                  numberOfLines={1}
                  style={[styles.name, on && styles.nameOn]}
                >
                  {a.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.section}>OR USE YOUR OWN</Text>
        <View>
          <Row
            icon={<CameraIcon size={22} color={colors.text} />}
            label="Take a photo"
            hint="Snap a new one with the camera"
            onPress={onSnap}
          />
          <Row
            icon={<GalleryIcon size={22} color={colors.text} />}
            label="Choose from gallery"
            onPress={onGallery}
          />
          {hasPhoto && (
            <Row
              icon={<TrashIcon size={22} color={colors.loss} />}
              label="Remove photo"
              danger
              onPress={() => setDraft(fallback)}
            />
          )}
        </View>
      </ScrollView>

      <View style={styles.save}>
        <Button label="Save" onPress={() => onSave(draft)} />
      </View>
    </Sheet>
  );
}

function Row({
  icon,
  label,
  hint,
  danger = false,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  danger?: boolean;
  onPress: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[styles.row, pressed && styles.rowOn]}
    >
      <View style={styles.tile}>{icon}</View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, danger && { color: colors.loss }]}>
          {label}
        </Text>
        {hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
      {!danger && <ChevronRightIcon size={16} color={ref.textSubtle} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { alignSelf: "stretch", flex: 1 },
  scrollContent: { paddingBottom: 8 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 4,
  },
  preview: { width: 72, height: 72, borderRadius: 36 },
  headerText: { flex: 1, gap: 2 },
  title: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 24,
    lineHeight: 30,
    color: colors.text,
  },
  subtitle: {
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    color: ref.textSubtle,
  },
  section: {
    marginTop: 22,
    marginBottom: 10,
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    letterSpacing: 0.8,
    color: ref.textSubtle,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -0 },
  cell: { alignItems: "center", gap: 6, paddingBottom: 12 },
  face: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
  },
  faceOn: {
    borderWidth: 2.5,
    borderColor: colors.text,
    width: 68,
    height: 68,
    borderRadius: 34,
  },
  faceImage: { width: 56, height: 56, borderRadius: 28 },
  tick: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.text,
    borderWidth: 2,
    borderColor: ref.sheet,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: ref.textSubtle,
  },
  nameOn: { fontFamily: "DMSans_700Bold", color: colors.text },
  row: {
    minHeight: 60,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: ref.line,
    borderRadius: radius.md,
  },
  rowOn: { backgroundColor: ref.line },
  tile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#211C2C",
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1 },
  rowLabel: {
    fontFamily: "DMSans_500Medium",
    fontSize: 16,
    lineHeight: 21,
    color: colors.text,
  },
  rowHint: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    lineHeight: 18,
    color: ref.textSubtle,
  },
  save: { alignSelf: "stretch", paddingTop: 12 },
});
