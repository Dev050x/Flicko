import type { ImageSourcePropType } from "react-native";

import data from "../../../assets/filters/filters.json";

/*
 * The camera's filter catalog (assets/filters/filters.json). Metro needs static
 * requires, so every overlay and thumbnail the JSON names is listed here once.
 */
export type FilterType =
  "none" | "face" | "frame" | "sticker" | "color" | "model";
export type FilterCategory = "trending" | "meme" | "solana" | "mood";

export interface Filter {
  id: string;
  name: string;
  category: FilterCategory;
  type: FilterType;
  premium: boolean;
  priceSkr?: number;
  overlay?: ImageSourcePropType;
  /** 3D models (GLB assets) on the face, drawn by Filament on the live preview */
  parts?: ModelPart[];
  /** image that replaces the background behind the person (person segmentation) */
  background?: number;
  /** 2D art placed on the screen around the face (3D filters) */
  stickers?: ScreenSticker[];
  anchor?: "eyes";
  notes?: string;
  thumb: ImageSourcePropType | null;
  matrix?: number[];
}

/*
 * One 3D model of a filter. Sizes and offsets are in eye distances in the head's own
 * frame (+x right, +y down, +z toward the camera) so the part follows the head:
 * `width` = the model's largest dimension; `pivot` = the point of the model placed at the
 * offset, in its bounding box (-1..1 per axis; [0, 0, 1] = the front centre); `rotate` =
 * degrees about x, y, z applied to the model first.
 */
export interface ModelPart {
  name: string;
  /** what the offset is from: between the eyes, or the screen-right mouth corner */
  anchor: "eyes" | "mouth-right";
  model: number;
  width: number;
  offset: [number, number, number];
  pivot: [number, number, number];
  rotate: [number, number, number];
}

/** Screen art: centre and width as fractions of the preview, rotation in degrees. */
export interface ScreenSticker {
  image: ImageSourcePropType;
  x: number;
  y: number;
  width: number;
  rotate: number;
  /** gently float up and down */
  bob: boolean;
  opacity: number;
}

const OVERLAYS: Record<string, ImageSourcePropType> = {
  "overlays/text-seeker.png": require("../../../assets/filters/overlays/text-seeker.png"),
  "overlays/text-to-the-moon.png": require("../../../assets/filters/overlays/text-to-the-moon.png"),
  "overlays/text-wagmi.png": require("../../../assets/filters/overlays/text-wagmi.png"),
  "overlays/laser-beam.png": require("../../../assets/filters/overlays/laser-beam.png"),
  "overlays/sticker-candle-up.png": require("../../../assets/filters/overlays/sticker-candle-up.png"),
  "overlays/sticker-chart-down.png": require("../../../assets/filters/overlays/sticker-chart-down.png"),
  "overlays/sticker-skr-coin.png": require("../../../assets/filters/overlays/sticker-skr-coin.png"),
};

const BACKGROUNDS: Record<string, number> = {
  "backgrounds/degen.jpg": require("../../../assets/filters/backgrounds/degen.jpg"),
};

const STICKERS: Record<string, ImageSourcePropType> = {
  "stickers/degen/portfolio.png": require("../../../assets/filters/stickers/degen/portfolio.png"),
  "stickers/rug-pull/frame.png": require("../../../assets/filters/stickers/rug-pull/frame.png"),
  "stickers/ai-agent/analysis.png": require("../../../assets/filters/stickers/ai-agent/analysis.png"),
  "stickers/ai-agent/buy-mode.png": require("../../../assets/filters/stickers/ai-agent/buy-mode.png"),
  "stickers/ai-agent/coin.png": require("../../../assets/filters/stickers/ai-agent/coin.png"),
  "stickers/degen/coin-a.png": require("../../../assets/filters/stickers/degen/coin-a.png"),
  "stickers/degen/coin-b.png": require("../../../assets/filters/stickers/degen/coin-b.png"),
  "stickers/degen/shiba.png": require("../../../assets/filters/stickers/degen/shiba.png"),
  "stickers/degen/can.png": require("../../../assets/filters/stickers/degen/can.png"),
};

const THUMBS: Record<string, ImageSourcePropType> = {
  "thumbs/degen-mode.png": require("../../../assets/filters/thumbs/degen-mode.png"),
  "thumbs/neon-goggles.png": require("../../../assets/filters/thumbs/neon-goggles.png"),
  "thumbs/rug-pull.png": require("../../../assets/filters/thumbs/rug-pull.png"),
  "thumbs/ai-agent.png": require("../../../assets/filters/thumbs/ai-agent.png"),
  "thumbs/degen.png": require("../../../assets/filters/thumbs/degen.png"),
  "thumbs/gm.png": require("../../../assets/filters/thumbs/gm.png"),
  "thumbs/laser-eyes.png": require("../../../assets/filters/thumbs/laser-eyes.png"),
  "thumbs/rekt.png": require("../../../assets/filters/thumbs/rekt.png"),
  "thumbs/solana.png": require("../../../assets/filters/thumbs/solana.png"),
  "thumbs/to-the-moon.png": require("../../../assets/filters/thumbs/to-the-moon.png"),
  "thumbs/wagmi.png": require("../../../assets/filters/thumbs/wagmi.png"),
};

const MODELS: Record<string, number> = {
  "models/neon-goggles.glb": require("../../../assets/filters/models/neon-goggles.glb"),
  "models/futuristic-goggles.glb": require("../../../assets/filters/models/futuristic-goggles.glb"),
  "models/crown.glb": require("../../../assets/filters/models/crown.glb"),
  "models/cigar.glb": require("../../../assets/filters/models/cigar.glb"),
};

type RawFilter = (typeof data.filters)[number] & {
  overlay?: string;
  parts?: {
    name: string;
    anchor?: string;
    model: string;
    width: number;
    offset: number[];
    pivot: number[];
    rotate?: number[];
  }[];
  stickers?: {
    image: string;
    x: number;
    y: number;
    width: number;
    rotate?: number;
    bob?: number;
  }[];
  thumb: string | null;
  matrix?: number[];
  priceSkr?: number;
  anchor?: string;
  notes?: string;
};

/*
 * Premium filters (SKR burned to post with them) are switched off for now: every filter
 * is free, so no lock chip shows and nothing is burned at launch. Flip this back to
 * turn them on; prices stay in filters.json (the server's unlock route reads them).
 */
export const PREMIUM_ENABLED = false;

export const FILTERS: Filter[] = (data.filters as RawFilter[]).map((f) => ({
  id: f.id,
  name: f.name,
  category: f.category as FilterCategory,
  type: f.type as FilterType,
  premium: PREMIUM_ENABLED && f.premium,
  priceSkr: f.priceSkr,
  overlay: f.overlay ? OVERLAYS[f.overlay] : undefined,
  parts: f.parts?.map((p) => ({
    name: p.name,
    anchor: p.anchor === "mouth-right" ? "mouth-right" : "eyes",
    model: MODELS[p.model],
    width: p.width,
    offset: p.offset as [number, number, number],
    pivot: p.pivot as [number, number, number],
    rotate: (p.rotate ?? [0, 0, 0]) as [number, number, number],
  })),
  background: (f as { background?: string }).background
    ? BACKGROUNDS[(f as { background?: string }).background!]
    : undefined,
  stickers: f.stickers?.map((t) => ({
    image: STICKERS[t.image],
    x: t.x,
    y: t.y,
    width: t.width,
    rotate: (t as { rotate?: number }).rotate ?? 0,
    bob: !!(t as { bob?: number }).bob,
    opacity: (t as { opacity?: number }).opacity ?? 1,
  })),
  anchor: f.anchor === "eyes" ? "eyes" : undefined,
  notes: f.notes,
  thumb: f.thumb ? (THUMBS[f.thumb] ?? null) : null,
  matrix: f.matrix,
}));

export const CATEGORIES = data.categories as FilterCategory[];

export const CATEGORY_LABEL: Record<FilterCategory, string> = {
  trending: "Trending",
  meme: "Meme",
  solana: "Solana",
  mood: "Mood",
};

export const NORMAL = FILTERS[0];

export const filterById = (id: string | undefined) =>
  FILTERS.find((f) => f.id === id) ?? NORMAL;

export const firstIndexOf = (category: FilterCategory) =>
  Math.max(
    0,
    FILTERS.findIndex((f) => f.category === category),
  );

/*
 * The colour a matrix gives mid grey: the static tint shown over the plain preview when
 * live filters are off, and the swatch for colour filters without a thumbnail.
 */
export const matrixTint = (matrix: number[], alpha = 0.28) => {
  const channel = (row: number) => {
    const m = matrix.slice(row * 5, row * 5 + 5);
    const v = (m[0] + m[1] + m[2]) * 0.5 + m[4];
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  };
  return `rgba(${channel(0)}, ${channel(1)}, ${channel(2)}, ${alpha})`;
};
