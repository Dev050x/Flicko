import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const amount = (name: string) => numeric(name, { precision: 39, scale: 0 });
const signedAmount = (name: string) =>
  numeric(name, { precision: 40, scale: 0 });
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const phase = pgEnum("phase", ["launch", "graduated"]);
export const uploadStatus = pgEnum("upload_status", [
  "pending",
  "finalized",
  "rejected",
]);
export const candleInterval = pgEnum("candle_interval", [
  "1m",
  "5m",
  "1h",
  "1d",
]);

export const users = pgTable("users", {
  wallet: text("wallet").primaryKey(),
  username: text("username").unique(),
  pushToken: text("push_token"),
  // One of the bundled avatars (`avatarId`) or an uploaded photo (`avatarUrl`), never both.
  avatarId: text("avatar_id"),
  avatarUrl: text("avatar_url"),
  createdAt: createdAt(),
});

export const memes = pgTable(
  "memes",
  {
    mint: text("mint").primaryKey(),
    memePda: text("meme_pda").notNull().unique(),
    creator: text("creator").notNull(),
    name: text("name").notNull(),
    symbol: text("symbol").notNull(),
    uri: text("uri").notNull(),
    imageUrl: text("image_url"),
    imageHash: text("image_hash").notNull(),
    captionTop: text("caption_top"),
    captionBottom: text("caption_bottom"),
    totalSupply: amount("total_supply").notNull(),
    startPrice: amount("start_price").notNull(),
    phase: phase("phase").notNull().default("launch"),
    price: amount("price").notNull(),
    tokensSold: amount("tokens_sold").notNull().default("0"),
    realSkr: amount("real_skr").notNull().default("0"),
    poolSkr: amount("pool_skr").notNull().default("0"),
    poolTokens: amount("pool_tokens").notNull().default("0"),
    tradeCount: integer("trade_count").notNull().default(0),
    hidden: boolean("hidden").notNull().default(false),
    createdSlot: bigint("created_slot", { mode: "number" }).notNull(),
    createdAt: createdAt(),
    graduatedAt: timestamp("graduated_at", { withTimezone: true }),
    lastTradeAt: timestamp("last_trade_at", { withTimezone: true }),
  },
  (t) => [
    index("memes_creator_idx").on(t.creator),
    index("memes_created_at_idx").on(t.createdAt),
    index("memes_image_hash_idx").on(t.imageHash),
  ],
);

export const trades = pgTable(
  "trades",
  {
    signature: text("signature").notNull(),
    eventIndex: integer("event_index").notNull(),
    mint: text("mint")
      .notNull()
      .references(() => memes.mint),
    trader: text("trader").notNull(),
    isBuy: boolean("is_buy").notNull(),
    skrAmount: amount("skr_amount").notNull(),
    tokenAmount: amount("token_amount").notNull(),
    creatorFee: amount("creator_fee").notNull(),
    burned: amount("burned").notNull(),
    priceAfter: amount("price_after").notNull(),
    phase: phase("phase").notNull(),
    slot: bigint("slot", { mode: "number" }).notNull(),
    blockTime: timestamp("block_time", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.signature, t.eventIndex] }),
    index("trades_mint_time_idx").on(t.mint, t.blockTime),
    index("trades_trader_idx").on(t.trader),
  ],
);

export const positions = pgTable(
  "positions",
  {
    wallet: text("wallet").notNull(),
    mint: text("mint")
      .notNull()
      .references(() => memes.mint),
    balance: amount("balance").notNull().default("0"),
    costBasisSkr: amount("cost_basis_skr").notNull().default("0"),
    realizedPnlSkr: signedAmount("realized_pnl_skr").notNull().default("0"),
    notifiedGainBps: integer("notified_gain_bps").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.wallet, t.mint] }),
    index("positions_mint_idx").on(t.mint),
  ],
);

export const creatorClaims = pgTable(
  "creator_claims",
  {
    signature: text("signature").notNull(),
    eventIndex: integer("event_index").notNull(),
    mint: text("mint")
      .notNull()
      .references(() => memes.mint),
    creator: text("creator").notNull(),
    amount: amount("amount").notNull(),
    slot: bigint("slot", { mode: "number" }).notNull(),
    blockTime: timestamp("block_time", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.signature, t.eventIndex] }),
    index("creator_claims_mint_idx").on(t.mint),
  ],
);

export const candles = pgTable(
  "candles",
  {
    mint: text("mint")
      .notNull()
      .references(() => memes.mint),
    interval: candleInterval("interval").notNull(),
    bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
    open: amount("open").notNull(),
    high: amount("high").notNull(),
    low: amount("low").notNull(),
    close: amount("close").notNull(),
    volumeSkr: amount("volume_skr").notNull().default("0"),
    trades: integer("trades").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.mint, t.interval, t.bucketStart] })],
);

export const uploads = pgTable(
  "uploads",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    wallet: text("wallet").notNull(),
    rawKey: text("raw_key").notNull(),
    finalKey: text("final_key"),
    imageHash: text("image_hash"),
    metadataUri: text("metadata_uri"),
    imageUrl: text("image_url"),
    name: text("name"),
    symbol: text("symbol"),
    captionTop: text("caption_top"),
    captionBottom: text("caption_bottom"),
    captions: jsonb("captions").$type<{ top: string; bottom: string }[]>(),
    status: uploadStatus("status").notNull().default("pending"),
    createdAt: createdAt(),
  },
  (t) => [
    index("uploads_wallet_idx").on(t.wallet),
    index("uploads_image_hash_idx").on(t.imageHash),
  ],
);

export const indexerState = pgTable("indexer_state", {
  id: text("id").primaryKey(),
  lastSignature: text("last_signature"),
  lastSlot: bigint("last_slot", { mode: "number" }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/*
 * Premium camera filters a wallet unlocked by burning SKR; one burn transaction unlocks
 * one filter.
 */
export const filterUnlocks = pgTable(
  "filter_unlocks",
  {
    wallet: text("wallet").notNull(),
    filterId: text("filter_id").notNull(),
    signature: text("signature").notNull().unique(),
    burned: amount("burned").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.wallet, t.filterId] })],
);

/* Memes a wallet stars on Markets or the meme page. */
export const watchlist = pgTable(
  "watchlist",
  {
    wallet: text("wallet").notNull(),
    mint: text("mint")
      .notNull()
      .references(() => memes.mint),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.wallet, t.mint] })],
);

export const reactionKind = pgEnum("reaction_kind", ["rocket", "fire", "poop"]);

/* One reaction of each kind per wallet per meme. */
export const reactions = pgTable(
  "reactions",
  {
    wallet: text("wallet").notNull(),
    mint: text("mint")
      .notNull()
      .references(() => memes.mint),
    kind: reactionKind("kind").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.wallet, t.mint, t.kind] }),
    index("reactions_mint_idx").on(t.mint),
  ],
);

export const alertDirection = pgEnum("alert_direction", ["above", "below"]);

/*
 * "Ping me when the price crosses X". `price` is SKR base units per whole token, like
 * memes.price; the notifier sets `triggered_at` once and never fires it again.
 */
export const priceAlerts = pgTable(
  "price_alerts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    wallet: text("wallet").notNull(),
    mint: text("mint")
      .notNull()
      .references(() => memes.mint),
    price: amount("price").notNull(),
    direction: alertDirection("direction").notNull(),
    triggeredAt: timestamp("triggered_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("price_alerts_mint_idx").on(t.mint)],
);
