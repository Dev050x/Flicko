import { beforeAll, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { join } from "node:path";
import * as schema from "../src/db/schema";

/*
 * Applies the real migrations to an in-memory Postgres (PGlite), no server or container needed.
 */
const db = drizzle(new PGlite(), { schema });
const U64_MAX = "18446744073709551615";
const MINT = "Mint1111111111111111111111111111111111111111";

beforeAll(async () => {
  await migrate(db, {
    migrationsFolder: join(import.meta.dir, "../drizzle"),
  });
  await db.insert(schema.memes).values({
    mint: MINT,
    memePda: "Meme111111111111111111111111111111111111111",
    creator: "Creator1111111111111111111111111111111111111",
    name: "Gm Ser",
    symbol: "GMSER",
    uri: "https://example.com/gm.json",
    imageHash: "ab".repeat(32),
    totalSupply: U64_MAX,
    startPrice: "1000",
    price: "999",
    createdSlot: 1,
  });
});

const trade = (signature: string, eventIndex = 0) => ({
  signature,
  eventIndex,
  mint: MINT,
  trader: "Trader111111111111111111111111111111111111111",
  isBuy: true,
  skrAmount: "100000000",
  tokenAmount: "89334000000",
  creatorFee: "2000000",
  burned: "500000",
  priceAfter: "1191",
  phase: "launch" as const,
  slot: 10,
  blockTime: new Date("2026-10-02T00:00:00Z"),
});

describe("schema migrations", () => {
  test("creates every table", async () => {
    const rows = await db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    expect(rows.rows.map((r) => r.table_name)).toEqual([
      "candles",
      "creator_claims",
      "filter_unlocks",
      "follows",
      "indexer_state",
      "likes",
      "memes",
      "positions",
      "price_alerts",
      "reactions",
      "trades",
      "uploads",
      "users",
      "watchlist",
    ]);
  });

  test("stores u64 amounts exactly and applies defaults", async () => {
    const [meme] = await db
      .select()
      .from(schema.memes)
      .where(eq(schema.memes.mint, MINT));
    expect(meme!.totalSupply).toBe(U64_MAX);
    expect(meme!.phase).toBe("launch");
    expect(meme!.tokensSold).toBe("0");
    expect(meme!.hidden).toBe(false);
  });

  test("a trade event can only be stored once", async () => {
    await db.insert(schema.trades).values(trade("sig-a"));
    await db.insert(schema.trades).values(trade("sig-a", 1));
    await expect(
      db.insert(schema.trades).values(trade("sig-a")).execute(),
    ).rejects.toThrow();
    const skipped = await db
      .insert(schema.trades)
      .values(trade("sig-a"))
      .onConflictDoNothing()
      .returning();
    expect(skipped).toHaveLength(0);
  });

  test("trades must reference a known meme", async () => {
    await expect(
      db
        .insert(schema.trades)
        .values({ ...trade("sig-b"), mint: "Unknown" })
        .execute(),
    ).rejects.toThrow();
  });

  test("positions keep signed realized pnl", async () => {
    await db.insert(schema.positions).values({
      wallet: "Trader111111111111111111111111111111111111111",
      mint: MINT,
      balance: "5",
      realizedPnlSkr: "-123456789",
    });
    const [position] = await db.select().from(schema.positions);
    expect(position!.realizedPnlSkr).toBe("-123456789");
  });

  test("candles upsert per mint, interval and bucket", async () => {
    const bucket = new Date("2026-10-02T00:05:00Z");
    const upsert = (price: string, volume: string) =>
      db
        .insert(schema.candles)
        .values({
          mint: MINT,
          interval: "5m",
          bucketStart: bucket,
          open: price,
          high: price,
          low: price,
          close: price,
          volumeSkr: volume,
          trades: 1,
        })
        .onConflictDoUpdate({
          target: [
            schema.candles.mint,
            schema.candles.interval,
            schema.candles.bucketStart,
          ],
          set: {
            high: sql`greatest(${schema.candles.high}, excluded.high)`,
            low: sql`least(${schema.candles.low}, excluded.low)`,
            close: sql`excluded.close`,
            volumeSkr: sql`${schema.candles.volumeSkr} + excluded.volume_skr`,
            trades: sql`${schema.candles.trades} + 1`,
          },
        });

    await upsert("1000", "50");
    await upsert("1200", "30");
    await upsert("900", "20");

    const [candle] = await db.select().from(schema.candles);
    expect(candle).toMatchObject({
      open: "1000",
      high: "1200",
      low: "900",
      close: "900",
      volumeSkr: "100",
      trades: 3,
    });
  });

  test("uploads get a generated id and pending status", async () => {
    const [upload] = await db
      .insert(schema.uploads)
      .values({
        wallet: "Creator1111111111111111111111111111111111111",
        rawKey: "raw/1.jpg",
      })
      .returning();
    expect(upload!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(upload!.status).toBe("pending");
  });
});
