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
  /** 3D model (GLB asset), drawn by Filament on the live preview */
  model?: number;
  anchor?: "eyes";
  notes?: string;
  thumb: ImageSourcePropType | null;
  matrix?: number[];
}

const OVERLAYS: Record<string, ImageSourcePropType> = {
  "overlays/deal-with-it.png": require("../../../assets/filters/overlays/deal-with-it.png"),
  "overlays/text-seeker.png": require("../../../assets/filters/overlays/text-seeker.png"),
  "overlays/text-to-the-moon.png": require("../../../assets/filters/overlays/text-to-the-moon.png"),
  "overlays/text-wagmi.png": require("../../../assets/filters/overlays/text-wagmi.png"),
  "overlays/laser-beam.png": require("../../../assets/filters/overlays/laser-beam.png"),
  "overlays/sticker-candle-up.png": require("../../../assets/filters/overlays/sticker-candle-up.png"),
  "overlays/sticker-chart-down.png": require("../../../assets/filters/overlays/sticker-chart-down.png"),
  "overlays/sticker-skr-coin.png": require("../../../assets/filters/overlays/sticker-skr-coin.png"),
};

const THUMBS: Record<string, ImageSourcePropType> = {
  "thumbs/deal-with-it.png": require("../../../assets/filters/thumbs/deal-with-it.png"),
  "thumbs/degen.png": require("../../../assets/filters/thumbs/degen.png"),
  "thumbs/gm.png": require("../../../assets/filters/thumbs/gm.png"),
  "thumbs/laser-eyes.png": require("../../../assets/filters/thumbs/laser-eyes.png"),
  "thumbs/rekt.png": require("../../../assets/filters/thumbs/rekt.png"),
  "thumbs/solana.png": require("../../../assets/filters/thumbs/solana.png"),
  "thumbs/to-the-moon.png": require("../../../assets/filters/thumbs/to-the-moon.png"),
  "thumbs/wagmi.png": require("../../../assets/filters/thumbs/wagmi.png"),
};

const MODELS: Record<string, number> = {
  "models/glasses.glb": require("../../../assets/filters/models/glasses.glb"),
};

type RawFilter = (typeof data.filters)[number] & {
  overlay?: string;
  model?: string;
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
  model: f.model ? MODELS[f.model] : undefined,
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
