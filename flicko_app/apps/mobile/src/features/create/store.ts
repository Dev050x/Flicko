import { create } from "zustand";

import type { Eyes } from "@/features/filters/placement";

import { clearDraft, saveDraft } from "./draft";

/*
 * Everything the create flow knows, from the snap to the launch, in one store so going
 * back and forth between Preview, Edit, Caption and Launch never loses work. Edits are
 * data (crop, slider values, layers, strokes, filter), never baked pixels; the image is
 * only flattened for saving, captions and the launch.
 */
export interface Photo {
  uri: string;
  width: number;
  height: number;
}

export type CropAspect = "free" | "original" | "4:5" | "1:1" | "9:16";

/*
 * `rect` is a fraction of the oriented photo (after `turns` quarter turns clockwise and
 * the horizontal flip).
 */
export interface Crop {
  rect: { x: number; y: number; width: number; height: number };
  turns: 0 | 1 | 2 | 3;
  flip: boolean;
  aspect: CropAspect;
}

export const ADJUST_KEYS = [
  "brightness",
  "contrast",
  "shadows",
  "highlights",
  "saturation",
  "warmth",
  "tint",
  "sharpness",
  "vignette",
] as const;
export type AdjustKey = (typeof ADJUST_KEYS)[number];
/** -100..100, 0 = untouched */
export type Adjust = Record<AdjustKey, number>;

export type TextStyle = "meme" | "clean" | "label";

/*
 * Layers sit on the final (cropped) image: `x`/`y` are fractions of its width/height,
 * `scale` sizes them relative to its width, `rotation` is in radians.
 */
interface LayerBase {
  id: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}
export interface TextLayer extends LayerBase {
  kind: "text";
  text: string;
  style: TextStyle;
  color: string;
}
export interface StickerLayer extends LayerBase {
  kind: "sticker";
  sticker: string;
}
export type Layer = TextLayer | StickerLayer;

/** Points as fractions of the final image, [x0, y0, x1, y1, ...]; `size` / width. */
export interface Stroke {
  color: string;
  size: number;
  points: number[];
}

export interface Edits {
  crop: Crop;
  adjust: Adjust;
  layers: Layer[];
  strokes: Stroke[];
  /** a catalog filter applied on top of the snap (the camera's filter is already in it) */
  filterId: string;
}

export interface Caption {
  top: string;
  bottom: string;
}

export const SUPPLY_PRESETS = [1e6, 1e7, 1e8, 1e9] as const;
export const PRICE_TIERS = {
  cheap: { label: "Cheap", skr: "0.00001" },
  standard: { label: "Standard", skr: "0.0001" },
  bold: { label: "Bold", skr: "0.001" },
} as const;
export type PriceTier = keyof typeof PRICE_TIERS;

export interface Prepared {
  uploadId: string;
  metadataUri: string;
  imageUrl: string;
  imageHash: string;
  name: string;
  symbol: string;
  /** the flattened file that was uploaded */
  fileUri: string;
  attestation: { authority: string; signature: string; expiresAt: number };
}

/*
 * One launch attempt. The mint keypair is kept for retries, so a launch that did land
 * can't be sent twice: a second create for the same mint fails on-chain.
 */
export interface LaunchAttempt {
  prepared: Prepared | null;
  mintSecret: number[] | null;
  signature: string | null;
}

export const freshEdits = (): Edits => ({
  crop: {
    rect: { x: 0, y: 0, width: 1, height: 1 },
    turns: 0,
    flip: false,
    aspect: "original",
  },
  adjust: Object.fromEntries(ADJUST_KEYS.map((k) => [k, 0])) as Adjust,
  layers: [],
  strokes: [],
  filterId: "none",
});

const freshLaunch = (): LaunchAttempt => ({
  prepared: null,
  mintSecret: null,
  signature: null,
});

interface CreateState {
  photo: Photo | null;
  /** the camera filter baked into the photo (premium ones are paid at launch) */
  filterId: string;
  edits: Edits;
  /** eyes found on the photo (photo pixels), once a face filter is picked in Edit */
  faces: Eyes[] | null;
  /** the Edit screen's undo stack for this session; `index` is the current entry */
  history: Edits[];
  index: number;
  /** edits when the Edit screen opened, restored by Cancel */
  opened: Edits | null;

  suggestions: Caption[];
  /** index into suggestions, "custom", or null for no caption */
  choice: number | "custom" | null;
  custom: Caption;
  name: string;
  symbol: string;
  nameEdited: boolean;
  symbolEdited: boolean;
  supply: number;
  supplyMode: "preset" | "custom";
  price: PriceTier;
  launch: LaunchAttempt;

  start: (photo: Photo, filterId: string) => void;
  setFaces: (faces: Eyes[]) => void;
  reset: () => void;

  beginEdit: () => void;
  /** live change (dragging, sliding); `commit` adds an undo step when it ends */
  change: (update: (edits: Edits) => Edits) => void;
  commit: () => void;
  undo: () => void;
  redo: () => void;
  cancelEdit: () => void;
  doneEdit: () => void;

  setSuggestions: (captions: Caption[]) => void;
  choose: (choice: number | "custom" | null) => void;
  setCustom: (caption: Caption) => void;
  setName: (name: string) => void;
  setSymbol: (symbol: string) => void;
  setSupply: (supply: number, mode: "preset" | "custom") => void;
  setPrice: (price: PriceTier) => void;
  setLaunch: (update: Partial<LaunchAttempt>) => void;
}

const STOP_WORDS = new Set(
  "A AN THE I IM ME MY WE OUR YOU YOUR IS ARE AM BE WAS ON IN OF TO AT FOR WHEN AND OR BUT SO IT ITS THIS THAT WITH JUST GET GOT DONT CANT NOT NO".split(
    " ",
  ),
);

export const captionOf = (
  s: Pick<CreateState, "suggestions" | "choice" | "custom">,
): Caption =>
  s.choice === "custom"
    ? s.custom
    : s.choice === null
      ? { top: "", bottom: "" }
      : (s.suggestions[s.choice] ?? { top: "", bottom: "" });

/** The caption's words as written, at most 32 characters of whole words. */
export const suggestName = ({ top, bottom }: Caption) => {
  let name = "";
  for (const word of `${top} ${bottom}`.split(/\s+/).filter(Boolean)) {
    const next = name ? `${name} ${word}` : word;
    if (next.length > 32) break;
    name = next;
  }
  return name;
};

/** The first meaningful caption word: "LASER EYES ON" → "LASER". */
export const suggestSymbol = ({ top, bottom }: Caption) => {
  const words = `${top} ${bottom}`
    .toUpperCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Z0-9]/g, ""))
    .filter(Boolean);
  const word = words.find((w) => !STOP_WORDS.has(w) && w.length > 1) ?? words[0];
  return (word ?? "").slice(0, 10);
};

/* Name and symbol follow the caption until the user types their own. */
const withSuggestedNames = (s: CreateState): Partial<CreateState> => {
  const caption = captionOf(s);
  return {
    ...(s.nameEdited ? {} : { name: suggestName(caption) }),
    ...(s.symbolEdited ? {} : { symbol: suggestSymbol(caption) }),
  };
};

const MAX_HISTORY = 50;

const initial = () => ({
  photo: null,
  filterId: "none",
  edits: freshEdits(),
  faces: null as Eyes[] | null,
  history: [] as Edits[],
  index: 0,
  opened: null,
  suggestions: [] as Caption[],
  choice: null,
  custom: { top: "", bottom: "" },
  name: "",
  symbol: "",
  nameEdited: false,
  symbolEdited: false,
  supply: 1e9,
  supplyMode: "preset" as const,
  price: "standard" as const,
  launch: freshLaunch(),
});

export const useCreateStore = create<CreateState>((set, get) => ({
  ...initial(),

  start: (photo, filterId) => set({ ...initial(), photo, filterId }),
  setFaces: (faces) => set({ faces }),
  reset: () => {
    set(initial());
    clearDraft();
  },

  beginEdit: () => {
    const { edits } = get();
    set({ opened: edits, history: [edits], index: 0 });
  },
  change: (update) => set((s) => ({ edits: update(s.edits) })),
  commit: () =>
    set((s) => {
      if (s.history[s.index] === s.edits) return {};
      const history = [...s.history.slice(0, s.index + 1), s.edits].slice(
        -MAX_HISTORY,
      );
      return { history, index: history.length - 1 };
    }),
  undo: () =>
    set((s) =>
      s.index > 0 ? { index: s.index - 1, edits: s.history[s.index - 1] } : {},
    ),
  redo: () =>
    set((s) =>
      s.index < s.history.length - 1
        ? { index: s.index + 1, edits: s.history[s.index + 1] }
        : {},
    ),
  cancelEdit: () =>
    set((s) => ({
      edits: s.opened ?? s.edits,
      opened: null,
      history: [],
      index: 0,
    })),
  doneEdit: () => set({ opened: null, history: [], index: 0 }),

  setSuggestions: (suggestions) =>
    set((s) => {
      const choice = suggestions.length && s.choice !== "custom" ? 0 : s.choice;
      return { suggestions, choice, ...withSuggestedNames({ ...s, suggestions, choice }) };
    }),
  choose: (choice) =>
    set((s) => ({ choice, ...withSuggestedNames({ ...s, choice }) })),
  setCustom: (custom) =>
    set((s) => ({
      custom,
      choice: "custom",
      ...withSuggestedNames({ ...s, custom, choice: "custom" }),
    })),
  setName: (name) => set({ name, nameEdited: true }),
  setSymbol: (symbol) => set({ symbol, symbolEdited: true }),
  setSupply: (supply, supplyMode) => set({ supply, supplyMode }),
  setPrice: (price) => set({ price }),
  setLaunch: (update) => set((s) => ({ launch: { ...s.launch, ...update } })),
}));

/*
 * Drafts: while a snap is in progress the flow is saved to local storage, so it can be
 * offered again later (no Drafts UI yet).
 */
useCreateStore.subscribe((s) => {
  if (s.photo) saveDraft(s);
});
