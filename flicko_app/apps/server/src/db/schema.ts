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
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.wallet, t.mint] }),
    index("positions_mint_idx").on(t.mint),
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
