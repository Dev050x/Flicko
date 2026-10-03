import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SceneCanvas, useSceneAssets } from "@/components/create/scene-canvas";
import { Button } from "@/components/ui/button";
import { ChevronLeftIcon, DrawIcon } from "@/components/ui/icons";
import { useCaptions } from "@/features/create/captions";
import { sceneAspect } from "@/features/create/scene";
import { type Caption, useCreateStore } from "@/features/create/store";
import { fitIn, useScene } from "@/features/create/use-scene";
import { colors, ref } from "@/theme";

/*
 * 3 · Caption (design-reference/CreateFlow.html): the meme with the chosen caption,
 * three suggestions (radio list, white selection), "New ideas", and "Write my own".
 * Tapping the chosen caption again clears it: a meme without a caption is fine.
 */
const CARD = { width: 240, height: 300 };
const MAX_LINE = 32;

export default function CreateCaption() {
  const insets = useSafeAreaInsets();
  const scene = useScene({ withCaption: true });
  const assets = useSceneAssets(scene);
  const suggestions = useCreateStore((s) => s.suggestions);
  const choice = useCreateStore((s) => s.choice);
  const custom = useCreateStore((s) => s.custom);
  const choose = useCreateStore((s) => s.choose);
  const setCustom = useCreateStore((s) => s.setCustom);
  const { status, refresh } = useCaptions();
  const [writing, setWriting] = useState(choice === "custom");


  const card = scene ? fitIn(sceneAspect(scene), CARD) : CARD;

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.back}
        >
          <ChevronLeftIcon />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Caption
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.card, { width: card.width, height: card.height }]}>
          {scene && (
            <SceneCanvas scene={scene} assets={assets} width={card.width} height={card.height} />
          )}
        </View>

        <View style={styles.list}>
          <View style={styles.listHead}>
            <Text style={styles.muted}>Suggested captions</Text>
            <View style={{ flex: 1 }} />
            {status !== "loading" && status !== "unsafe" && (
              <Pressable accessibilityRole="button" onPress={refresh} hitSlop={8}>
                <Text style={styles.newIdeas}>New ideas</Text>
              </Pressable>
            )}
          </View>

          {status === "loading" && [0, 1, 2].map((i) => <Skeleton key={i} />)}
          {status === "ready" &&
            suggestions.map((caption, i) => (
              <Option
                key={`${caption.top}|${caption.bottom}|${i}`}
                caption={caption}
                selected={choice === i}
                onPress={() => choose(choice === i ? null : i)}
              />
            ))}
          {status === "error" && (
            <View style={styles.problem}>
              <Text style={styles.problemText}>Couldn&apos;t load suggestions</Text>
              <Pressable accessibilityRole="button" onPress={refresh} hitSlop={8}>
                <Text style={styles.newIdeas}>Try again</Text>
              </Pressable>
            </View>
          )}
          {status === "unsafe" && (
            <View style={styles.problem}>
              <Text style={styles.problemText}>This photo can&apos;t be posted</Text>
            </View>
          )}

          {status !== "unsafe" &&
            (writing ? (
              <CustomCaption
                value={custom}
                selected={choice === "custom"}
                onSelect={() => choose(choice === "custom" ? null : "custom")}
                onChange={setCustom}
              />
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setWriting(true);
                  choose("custom");
                }}
                style={styles.writeOwn}
              >
                <DrawIcon size={18} color={colors.textMuted} />
                <Text style={styles.writeOwnText}>Write my own</Text>
              </Pressable>
            ))}
        </View>
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 24 }]}>
        <Button
          label="Next"
          disabled={status === "unsafe"}
          onPress={() => router.push("/create/launch")}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function Radio({ selected }: { selected: boolean }) {
  return (
    <View style={[styles.radio, selected && styles.radioOn]}>
      {selected && <View style={styles.radioDot} />}
    </View>
  );
}

function Option({
  caption,
  selected,
  onPress,
}: {
  caption: Caption;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${caption.top} ${caption.bottom}`}
      onPress={onPress}
      style={[styles.option, selected && styles.optionOn]}
    >
      <Radio selected={selected} />
      <View style={{ flex: 1, gap: 2 }}>
        {!!caption.top && <Text style={styles.line}>{caption.top}</Text>}
        {!!caption.bottom && <Text style={styles.line}>{caption.bottom}</Text>}
      </View>
    </Pressable>
  );
}

function CustomCaption({
  value,
  selected,
  onSelect,
  onChange,
}: {
  value: Caption;
  selected: boolean;
  onSelect: () => void;
  onChange: (caption: Caption) => void;
}) {
  const bottom = useRef<TextInput>(null);
  const clean = (text: string) => text.toUpperCase().slice(0, MAX_LINE);
  return (
    <View style={[styles.option, styles.custom, selected && styles.optionOn]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel="Use my own caption"
        onPress={onSelect}
        hitSlop={10}
      >
        <Radio selected={selected} />
      </Pressable>
      <View style={{ flex: 1, gap: 8 }}>
        <TextInput
          value={value.top}
          onChangeText={(top) => onChange({ ...value, top: clean(top) })}
          placeholder="Top text"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="characters"
          maxLength={MAX_LINE}
          returnKeyType="next"
          onSubmitEditing={() => bottom.current?.focus()}
          style={styles.input}
        />
        <TextInput
          ref={bottom}
          value={value.bottom}
          onChangeText={(text) => onChange({ ...value, bottom: clean(text) })}
          placeholder="Bottom text"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="characters"
          maxLength={MAX_LINE}
          style={styles.input}
        />
      </View>
    </View>
  );
}

function Skeleton() {
  const pulse = useSharedValue(0.5);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View style={[styles.option, style]} accessibilityLabel="Loading caption">
      <View style={styles.radio} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={[styles.bar, { width: "70%" }]} />
        <View style={[styles.bar, { width: "45%" }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { height: 44, justifyContent: "center", alignItems: "center" },
  back: { position: "absolute", left: 20, top: 10 },
  title: { fontFamily: "DMSans_700Bold", fontSize: 16, color: colors.text },
  content: { alignItems: "center", paddingTop: 8, paddingBottom: 24 },
  card: { borderRadius: 24, overflow: "hidden", backgroundColor: "#000000" },
  list: { alignSelf: "stretch", paddingHorizontal: 24, marginTop: 20, gap: 10 },
  listHead: { flexDirection: "row", alignItems: "center" },
  muted: { fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.textMuted },
  newIdeas: {
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    color: colors.text,
    textDecorationLine: "underline",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionOn: {
    borderColor: "rgba(255,255,255,0.55)",
    backgroundColor: colors.surfaceSunken,
  },
  custom: { alignItems: "flex-start" },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: ref.lineDashed,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: colors.text },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.text },
  line: {
    fontFamily: "DMSans_700Bold",
    fontSize: 14,
    letterSpacing: 0.3,
    color: colors.text,
  },
  input: {
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: "DMSans_700Bold",
    fontSize: 14,
    letterSpacing: 0.3,
    color: colors.text,
  },
  writeOwn: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
  },
  writeOwnText: { fontFamily: "DMSans_500Medium", fontSize: 15, color: colors.textMuted },
  problem: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 6,
  },
  problemText: { fontFamily: "DMSans_500Medium", fontSize: 14, color: colors.text },
  bar: { height: 10, borderRadius: 5, backgroundColor: colors.border },
  bottom: { paddingHorizontal: 24, paddingTop: 12 },
});
