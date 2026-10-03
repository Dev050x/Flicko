import type { ImageSource } from "expo-image";

/*
 * A meme in the feed. Prices are SKR per token; supply counts are whole tokens.
 */
export interface Creator {
  handle: string;
  avatarUrl: ImageSource | string;
  isFollowing: boolean;
}

export type MemeStatus = "launching" | "trading";

export interface Meme {
  id: string;
  imageUrl: ImageSource | string;
  creator: Creator;
  /** without the $, e.g. "CANDLE" */
  ticker: string;
  /** ms since epoch */
  createdAt: number;
  status: MemeStatus;
  supplyTotal: number;
  supplySold: number;
  /** SKR */
  launchPrice: number;
  /** SKR, trading only */
  poolPrice?: number;
  /** trading only */
  changeSinceLaunchPct?: number;
  /** trading only, oldest first, for the sparkline */
  priceHistory?: number[];
  /** trading only */
  soldOutDurationMin?: number;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
}

export type FeedTab = "following" | "forYou" | "launching";
