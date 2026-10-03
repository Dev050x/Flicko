import type { ImageSource } from "expo-image";

/*
 * A meme in the feed. Prices are SKR per whole token; supply counts are whole tokens.
 * `supplyTotal` / `supplySold` count the launch sale (4/5 of the meme's supply); the
 * rest seeds the pool.
 */
export interface Creator {
  wallet: string;
  handle: string;
  avatarUrl: ImageSource | string;
  isFollowing: boolean;
}

export type MemeStatus = "launching" | "trading";

export interface Meme {
  /** the mint address */
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
  /** SKR, the curve's starting price */
  launchPrice: number;
  /** SKR, the current curve or pool price */
  price: number;
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
