import { beforeEach, describe, expect, test } from "bun:test";
import { Keypair } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import { memes, positions, priceAlerts, users } from "../src/db/schema";
import type { FlickoEvent } from "../src/indexer/events";
import { expoPushSender, type PushMessage } from "../src/notify/expo";
import { createNotifier } from "../src/notify/notifier";
import { migratedDb } from "./support";

/*
 * Meme M (price per whole token) with creator C and holders H1 (has a push token) and H2 (none).
 * Both holders paid 1000 for 1 token, so price 1600 = +60% and 2100 = +110%.
 * The clock is fake so cooldowns and event ages are exact.
 */
const key = () => Keypair.generate().publicKey.toBase58();
const MINT = key();
const PDA = key();
const C = key();
const H1 = key();
const H2 = key();
const T = key();
const C_TOKEN = "ExponentPushToken[creator]";
const H1_TOKEN = "ExponentPushToken[holder1]";

let db: Awaited<ReturnType<typeof migratedDb>>;
let sent: PushMessage[][] = [];
let invalid: string[] = [];
let clock = 1_800_000_000_000;
const notifier = () =>
  createNotifier({
    db,
    now: () => clock,
    sender: {
      send: async (messages) => {
        sent.push(messages);
        return { invalidTokens: invalid };
      },
    },
  });
const nowSeconds = () => Math.floor(clock / 1000);

const trade = (
  fields: Partial<Extract<FlickoEvent, { kind: "trade" }>> = {},
): FlickoEvent => ({
  kind: "trade",
  meme: PDA,
  trader: T,
  isBuy: true,
  skrAmount: "12500000",
  tokenAmount: "1",
  creatorFee: "0",
  burned: "0",
  priceAfter: "1600",
  phase: "launch",
  ...fields,
});

const setPrice = (price: string) =>
  db.update(memes).set({ price }).where(eq(memes.mint, MINT));

beforeEach(async () => {
  db = await migratedDb();
  sent = [];
  invalid = [];
  await db
    .insert(users)
    .values([
      { wallet: C, pushToken: C_TOKEN },
      { wallet: H1, pushToken: H1_TOKEN },
      { wallet: H2 },
    ]);
  await db.insert(memes).values({
    mint: MINT,
    memePda: PDA,
    creator: C,
    name: "Doge Ser",
    symbol: "DSER",
    uri: "https://example.com/m.json",
    imageHash: "00".repeat(32),
    totalSupply: "1000000000000",
    startPrice: "1000",
    price: "1600",
    createdSlot: 1,
  });
  await db.insert(positions).values([
    { wallet: H1, mint: MINT, balance: "1000000", costBasisSkr: "1000" },
    { wallet: H2, mint: MINT, balance: "1000000", costBasisSkr: "1000" },
  ]);
});

describe("notifier", () => {
  test("a fresh buy pings the creator and holders who crossed +50%", async () => {
    expect(await notifier().notify([trade()], nowSeconds())).toBe(2);
    const [batch] = sent;
    expect(batch).toContainEqual({
      to: C_TOKEN,
      title: "🟢 New buyer on Doge Ser",
      body: "Someone just bought 12.5 SKR worth. You earn 2% of every trade.",
      data: { kind: "buyer", mint: MINT },
    });
    expect(batch).toContainEqual({
      to: H1_TOKEN,
      title: "🚀 Doge Ser is up 50%",
      body: "Your bag is pumping. Take profit or keep holding?",
      data: { kind: "gain", mint: MINT },
    });
    const rows = await db.select().from(positions);
    expect(rows.map((r) => r.notifiedGainBps)).toEqual([5000, 5000]);
  });

  test("each gain level fires once and higher levels fire later", async () => {
    const n = notifier();
    await n.notify([trade({ isBuy: false })], nowSeconds());
    await n.notify([trade({ isBuy: false })], nowSeconds());
    expect(sent.flat().map((m) => m.title)).toEqual(["🚀 Doge Ser is up 50%"]);
    await setPrice("2100");
    await n.notify([trade({ isBuy: false })], nowSeconds());
    expect(sent.flat().at(-1)!.title).toBe("🚀 Doge Ser is up 2x");
  });

  test("buyer pings are throttled to one per 5 minutes per meme", async () => {
    const n = notifier();
    await setPrice("1000");
    await n.notify([trade()], nowSeconds());
    clock += 60_000;
    await n.notify([trade()], nowSeconds());
    clock += 5 * 60_000;
    await n.notify([trade()], nowSeconds());
    expect(sent.flat().filter((m) => m.data?.kind === "buyer")).toHaveLength(2);
  });

  test("the creator's own buys and all sells never ping the creator", async () => {
    await setPrice("1000");
    const n = notifier();
    await n.notify(
      [trade({ trader: C }), trade({ isBuy: false })],
      nowSeconds(),
    );
    expect(sent).toEqual([]);
  });

  test("graduation reaches the creator and every holder with a token once", async () => {
    await db
      .insert(positions)
      .values({ wallet: C, mint: MINT, balance: "5", costBasisSkr: "0" });
    await notifier().notify(
      [
        {
          kind: "graduated",
          meme: PDA,
          poolSkr: "1",
          poolTokens: "1",
          graduatedAt: 0,
        },
      ],
      nowSeconds(),
    );
    expect(sent[0]!.map((m) => m.to).sort()).toEqual(
      [C_TOKEN, H1_TOKEN].sort(),
    );
    expect(sent[0]![0]!.title).toBe("🎓 Doge Ser graduated!");
  });

  test("events older than 15 minutes are ignored", async () => {
    expect(await notifier().notify([trade()], nowSeconds() - 16 * 60)).toBe(0);
    expect(sent).toEqual([]);
  });

  test("dead device tokens are cleared", async () => {
    invalid = [H1_TOKEN];
    await notifier().notify([trade()], nowSeconds());
    const [h1] = await db.select().from(users).where(eq(users.wallet, H1));
    expect(h1!.pushToken).toBeNull();
  });
});

describe("price alerts", () => {
  test("fire once when the price crosses them, in either direction", async () => {
    await db.insert(priceAlerts).values([
      { wallet: C, mint: MINT, price: "1500", direction: "above" }, // crossed at 1600
      { wallet: C, mint: MINT, price: "2000", direction: "above" }, // not yet
      { wallet: H1, mint: MINT, price: "1700", direction: "below" }, // crossed at 1600
      { wallet: H2, mint: MINT, price: "1700", direction: "below" }, // crossed, but no token
    ]);
    const n = notifier();
    await n.notify([trade({ isBuy: false })], nowSeconds());
    const alertsSent = sent.flat().filter((m) => m.data?.kind === "alert");
    expect(alertsSent).toContainEqual({
      to: C_TOKEN,
      title: "🔔 $DSER is above 0.0015 SKR",
      body: "Doge Ser is now 0.0016 SKR. Your alert at 0.0015 SKR fired.",
      data: { kind: "alert", mint: MINT },
    });
    expect(alertsSent.map((m) => m.to).sort()).toEqual([C_TOKEN, H1_TOKEN].sort());

    const rows = await db.select().from(priceAlerts);
    const fired = rows.filter((r) => r.triggeredAt !== null).map((r) => r.price);
    expect(fired.sort()).toEqual(["1500", "1700", "1700"]);

    // already fired: nothing again; the 2000 one fires once the price gets there
    sent = [];
    await n.notify([trade({ isBuy: false })], nowSeconds());
    expect(sent.flat().filter((m) => m.data?.kind === "alert")).toEqual([]);
    await setPrice("2100");
    await n.notify([trade({ isBuy: false })], nowSeconds());
    expect(sent.flat().filter((m) => m.data?.kind === "alert").map((m) => m.title)).toEqual([
      "🔔 $DSER is above 0.002 SKR",
    ]);
  });
});

describe("expoPushSender", () => {
  test("sends in batches of 100 and reports unregistered devices", async () => {
    const calls: { body: any[]; auth: string | null }[] = [];
    const fetch = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as PushMessage[];
      calls.push({
        body,
        auth: new Headers(init.headers).get("authorization"),
      });
      return Response.json({
        data: body.map((m) =>
          m.to.endsWith("[dead]")
            ? { status: "error", details: { error: "DeviceNotRegistered" } }
            : { status: "ok" },
        ),
      });
    }) as unknown as typeof globalThis.fetch;
    const messages = Array.from({ length: 150 }, (_, i) => ({
      to: i === 120 ? "ExponentPushToken[dead]" : `ExponentPushToken[${i}]`,
      title: "t",
      body: "b",
    }));
    const result = await expoPushSender({ accessToken: "secret", fetch }).send(
      messages,
    );
    expect(calls.map((c) => c.body.length)).toEqual([100, 50]);
    expect(calls[0]!.auth).toBe("Bearer secret");
    expect(calls[0]!.body[0].sound).toBe("default");
    expect(result.invalidTokens).toEqual(["ExponentPushToken[dead]"]);
  });

  test("throws when expo is down", async () => {
    const fetch = (async () =>
      new Response("nope", {
        status: 503,
      })) as unknown as typeof globalThis.fetch;
    await expect(
      expoPushSender({ fetch }).send([{ to: "x", title: "t", body: "b" }]),
    ).rejects.toThrow("expo push returned 503");
  });
});
