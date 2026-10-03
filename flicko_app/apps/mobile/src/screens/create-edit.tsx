import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Alert, BackHandler, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SceneCanvas, useSceneAssets } from "@/components/create/scene-canvas";
import {
  AdjustIcon,
  CropIcon,
  DrawIcon,
  FiltersIcon,
  RedoIcon,
  StickerIcon,
  UndoIcon,
} from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { AdjustTool } from "@/features/create/edit/adjust-tool";
import { IconButton } from "@/features/create/edit/controls";
import { CropOverlay, CropTool } from "@/features/create/edit/crop-tool";
import { BRUSH_SIZES, DrawTool, type Brush } from "@/features/create/edit/draw-tool";
import { EditCanvas, type EditTool } from "@/features/create/edit/edit-canvas";
import { FilterTool } from "@/features/create/edit/filter-tool";
import { StickerTool } from "@/features/create/edit/sticker-tool";
import {
  newTextLayer,
  TextEditor,
  TextTool,
  type TextDefaults,
} from "@/features/create/edit/text-tool";
import { sceneAspect } from "@/features/create/scene";
import { type TextLayer, useCreateStore } from "@/features/create/store";
import { fitIn, useScene } from "@/features/create/use-scene";
import { colors, cam } from "@/theme";

/*
 * 2 · Edit (design-reference/CreateFlow.html): Cancel · Edit · Done, the photo with
 * edits applied live, the tool's panel, and the tool bar. Edits stay data until export.
 * Cancel (or back) drops everything since the screen opened; Done keeps it.
 */
const TOOLS: { id: EditTool; label: string; icon: (color: string) => ReactNode }[] = [
  { id: "crop", label: "Crop", icon: (c) => <CropIcon color={c} /> },
  { id: "adjust", label: "Adjust", icon: (c) => <AdjustIcon color={c} /> },
  {
    id: "text",
    label: "Text",
    icon: (c) => <Text style={{ fontFamily: "DMSans_700Bold", fontSize: 17, color: c }}>Aa</Text>,
  },
  { id: "stickers", label: "Stickers", icon: (c) => <StickerIcon color={c} /> },
  { id: "draw", label: "Draw", icon: (c) => <DrawIcon color={c} /> },
  { id: "filters", label: "Filters", icon: (c) => <FiltersIcon color={c} /> },
];
const PANEL_HEIGHT = 236;
const TOOLBAR_HEIGHT = 80;

const isTool = (value: string | undefined): value is EditTool =>
  TOOLS.some((t) => t.id === value);

export default function CreateEdit() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tool?: string }>();
  const [tool, setTool] = useState<EditTool>(isTool(params.tool) ? params.tool : "adjust");
  const scene = useScene();
  const uncropped = useMemo(
    () => (scene && tool === "crop" ? { ...scene, uncropped: true } : null),
    [scene, tool],
  );
  const assets = useSceneAssets(scene);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [textDefaults, setTextDefaults] = useState<TextDefaults>({
    style: "meme",
    color: "#FFFFFF",
  });
  const [brush, setBrush] = useState<Brush>({ size: BRUSH_SIZES[1].size, color: "#FFFFFF" });
  const { toast, show } = useToast(insets.top + 56);

  const beginEdit = useCreateStore((s) => s.beginEdit);
  const cancelEdit = useCreateStore((s) => s.cancelEdit);
  const doneEdit = useCreateStore((s) => s.doneEdit);
  const change = useCreateStore((s) => s.change);
  const commit = useCreateStore((s) => s.commit);
  const canUndo = useCreateStore((s) => s.index > 0);
  const canRedo = useCreateStore((s) => s.index < s.history.length - 1);
  const undo = useCreateStore((s) => s.undo);
  const redo = useCreateStore((s) => s.redo);

  useEffect(() => {
    beginEdit();
  }, [beginEdit]);


  const changed = () => {
    const { edits, opened } = useCreateStore.getState();
    return opened !== null && edits !== opened;
  };

  const cancel = useCallback(() => {
    const leave = () => {
      cancelEdit();
      router.back();
    };
    if (!changed()) return leave();
    Alert.alert("Discard changes?", "Edits made since you opened Edit will be lost.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: leave },
    ]);
  }, [cancelEdit]);

  const done = () => {
    doneEdit();
    router.back();
  };

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        cancel();
        return true;
      });
      return () => sub.remove();
    }, [cancel]),
  );

  const addText = (x = 0.5, y = 0.45) => {
    const layer = newTextLayer(textDefaults, x, y);
    change((e) => ({ ...e, layers: [...e.layers, layer] }));
    setSelectedId(layer.id);
    setEditingId(layer.id);
  };

  const finishText = (text: string) => {
    const id = editingId;
    setEditingId(null);
    if (!id) return;
    if (!text.trim()) {
      change((e) => ({ ...e, layers: e.layers.filter((l) => l.id !== id) }));
      setSelectedId(null);
    } else {
      change((e) => ({
        ...e,
        layers: e.layers.map((l) => (l.id === id && l.kind === "text" ? { ...l, text } : l)),
      }));
    }
    commit();
  };

  const layers = scene?.edits.layers ?? [];
  const selected = layers.find((l) => l.id === selectedId) ?? null;
  const editing = layers.find((l) => l.id === editingId) as TextLayer | undefined;
  const shown = uncropped ?? scene;
  const size = shown ? fitIn(sceneAspect(shown), area) : area;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" onPress={cancel} hitSlop={10}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Edit
        </Text>
        <Pressable accessibilityRole="button" onPress={done} hitSlop={10}>
          <Text style={styles.done}>Done</Text>
        </Pressable>
      </View>

      <View
        style={styles.area}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setArea({ width: width - 48, height: height - 16 });
        }}
      >
        {scene && size.width > 0 && (
          <View style={[styles.photo, { width: size.width, height: size.height }]}>
            {uncropped ? (
              <>
                <SceneCanvas scene={uncropped} assets={assets} width={size.width} height={size.height} />
                <CropOverlay width={size.width} height={size.height} />
              </>
            ) : (
              <EditCanvas
                scene={scene}
                assets={assets}
                width={size.width}
                height={size.height}
                tool={tool}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onEditText={setEditingId}
                onAddText={addText}
                brush={brush}
              />
            )}
          </View>
        )}
        {tool !== "draw" && (
          <View style={styles.history}>
            <IconButton label="Undo" disabled={!canUndo} onPress={undo}>
              <UndoIcon size={18} />
            </IconButton>
            <IconButton label="Redo" disabled={!canRedo} onPress={redo}>
              <RedoIcon size={18} />
            </IconButton>
          </View>
        )}
      </View>

      <View style={{ height: PANEL_HEIGHT }}>
        {tool === "crop" && <CropTool />}
        {tool === "adjust" && <AdjustTool />}
        {tool === "text" && (
          <TextTool
            selected={selected?.kind === "text" ? selected : null}
            defaults={textDefaults}
            onDefaults={setTextDefaults}
            onAdd={() => addText()}
          />
        )}
        {tool === "stickers" && <StickerTool onAdded={setSelectedId} />}
        {tool === "draw" && <DrawTool brush={brush} onBrush={setBrush} />}
        {tool === "filters" && <FilterTool onNotice={show} />}
      </View>

      <View
        style={[styles.toolbar, { height: TOOLBAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom }]}
        accessibilityRole="tablist"
      >
        {TOOLS.map((t) => {
          const active = t.id === tool;
          return (
            <Pressable
              key={t.id}
              accessibilityRole="tab"
              accessibilityLabel={t.label}
              accessibilityState={{ selected: active }}
              onPress={() => setTool(t.id)}
              style={styles.tool}
            >
              <View style={{ opacity: active ? 1 : 0.6 }}>{t.icon(colors.text)}</View>
              <Text style={[styles.toolLabel, active && styles.toolLabelOn]}>{t.label}</Text>
              <View style={[styles.underline, active && styles.underlineOn]} />
            </Pressable>
          );
        })}
      </View>

      {editing && <TextEditor key={editing.id} layer={editing} onDone={finishText} />}
      {toast}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  cancel: { fontFamily: "DMSans_500Medium", fontSize: 16, color: colors.textMuted },
  title: { fontFamily: "DMSans_700Bold", fontSize: 16, color: colors.text },
  done: { fontFamily: "DMSans_700Bold", fontSize: 16, color: colors.text },
  area: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8 },
  photo: { borderRadius: 20, overflow: "hidden" },
  history: { position: "absolute", right: 12, bottom: 4, gap: 8 },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 14,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  tool: { width: 60, alignItems: "center", gap: 6 },
  toolLabel: { fontFamily: "DMSans_500Medium", fontSize: 11, color: cam.tabInactive },
  toolLabelOn: { fontFamily: "DMSans_700Bold", color: colors.text },
  underline: { width: 18, height: 3, borderRadius: 2 },
  underlineOn: { backgroundColor: colors.text },
});
