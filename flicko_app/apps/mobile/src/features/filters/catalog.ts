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

/*
 * The 2D overlay and thumbnail art was removed from the repo while the 3D filters are
 * built, so only the filters below are offered (see FILTERS).
 */
const OVERLAYS: Record<string, ImageSourcePropType> = {};
const THUMBS: Record<string, ImageSourcePropType> = {};
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

export const FILTERS: Filter[] = (data.filters as RawFilter[])
  .filter((f) => f.type === "none" || f.type === "model")
  .map((f) => ({
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
