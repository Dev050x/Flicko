import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { PROGRAM_ID } from "@flicko/sdk";
import { Keypair } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import type { CaptionAi, CaptionResult } from "../src/ai/captions";
import { createApp } from "../src/app";
import { createAttestor } from "../src/attest/attestor";
import { createSessions } from "../src/auth/jwt";
import { memes, uploads } from "../src/db/schema";
import type { ChainTransaction } from "../src/indexer/apply";
import { createEventDecoder } from "../src/indexer/events";
import { sha256Hex } from "../src/media/imaging";
import { memoryBlobStore } from "../src/storage/blobs";
import fixture from "./fixtures/devnet-smoke.json";
import { migratedDb, serve, testWallet } from "./support";

/*
 * The create flow's routes. The AI is a fake; the chain serves the real devnet smoke-test
 * create transaction, whose creator is CREATOR.
 */
const SAFE: CaptionResult = {
  safe: true,
  reason: "",
  captions: [
    { top: "LASER EYES ON", bottom: "DEV IS SHOOK" },
    { top: "WHEN THE CHART", bottom: "HITS 100X" },
    { top: "I DON'T READ CHARTS", bottom: "I AM THE CHART" },
  ],
};
const CREATOR = "HcVaU1rFeQUQujC24G3d35nBxpNc29cJV4Kfmr3LoYH";
const CREATE_TX = fixture.transactions[0] as ChainTransaction;
const SMOKE_HASH =
  "ab87a2bf161de3544465f93a6dea81cb3d0fad1e820b6a08c973d64aa1b7939d";

let verdict: CaptionResult = SAFE;
let flagged = false;
let analysed = 0;
const ai: CaptionAi = {
  analyse: async () => {
    analysed++;
    return verdict;
  },
  moderateText: async () => flagged,
};

const sessions = createSessions("test-secret");
const blobs = memoryBlobStore();
const alice = testWallet().address;
let db: Awaited<ReturnType<typeof migratedDb>>;
let url = "";
let close = () => {};
let photo: Uint8Array;
let tokens: Record<string, string> = {};

const form = (fields: Record<string, string>, image: Uint8Array | null = photo) => {
  const body = new FormData();
  if (image) {
    body.set("image", new Blob([image], { type: "image/jpeg" }), "meme.jpg");
  }
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  return body;
};

const post = async (
  path: string,
  body: FormData | object,
  wallet: string | null = alice,
) => {
  const isForm = body instanceof FormData;
  const res = await fetch(`${url}${path}`, {
    method: "POST",
    headers: {
      ...(wallet ? { authorization: `Bearer ${tokens[wallet]}` } : {}),
      ...(isForm ? {} : { "content-type": "application/json" }),
    },
    body: isForm ? body : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
};

const prepare = (fields: Record<string, string> = {}, wallet = alice) =>
  post(
    "/memes/prepare",
    form({
      name: "Laser Eyes On",
      symbol: "laser",
      caption: JSON.stringify({ top: "laser eyes on", bottom: "dev is shook" }),
      ...fields,
    }),
    wallet,
  );

beforeAll(async () => {
  db = await migratedDb();
  photo = new Uint8Array(
    await sharp({
      create: { width: 720, height: 1280, channels: 3, background: "#4477aa" },
    })
      .jpeg()
      .toBuffer(),
  );
  tokens = {
    [alice]: (await sessions.issue(alice)).token,
    [CREATOR]: (await sessions.issue(CREATOR)).token,
  };
  ({ url, close } = await serve(
    createApp({
      corsOrigin: "*",
      health: {
        ping: async () => {},
        cluster: "devnet",
        programId: "prog",
        skrMint: "skr",
      },
      create: {
        db,
        sessions,
        blobs,
        ai,
        attestor: createAttestor(Keypair.generate().secretKey),
        chain: {
          transaction: async (signature) =>
            signature === CREATE_TX.signature ? CREATE_TX : null,
          loadMemeState: async () => null,
        },
        decode: createEventDecoder(PROGRAM_ID),
        siteUrl: "https://flicko.app",
      },
    }),
  ));
});

beforeEach(() => {
  verdict = SAFE;
  flagged = false;
  analysed = 0;
});

afterAll(() => close());

describe("POST /captions", () => {
  test("returns three captions for a safe photo, without a session", async () => {
    const { status, body } = await post("/captions", form({}), null);
    expect(status).toBe(200);
    expect(body).toEqual({ safe: true, captions: SAFE.captions });
  });

  test("422 when the photo is unsafe", async () => {
    verdict = { safe: false, reason: "nope", captions: [] };
    const { status, body } = await post("/captions", form({}));
    expect(status).toBe(422);
    expect(body.error).toBe("image rejected");
  });

  test("needs a jpeg file", async () => {
    expect((await post("/captions", form({}, null))).status).toBe(400);
    const png = new Uint8Array(
      await sharp({
        create: { width: 10, height: 10, channels: 3, background: "#000" },
      })
        .png()
        .toBuffer(),
    );
    expect((await post("/captions", form({}, png))).status).toBe(400);
    expect((await post("/captions", { image: "x" })).status).toBe(415);
  });

  test("refuses photos over 1440px", async () => {
    const big = new Uint8Array(
      await sharp({
        create: { width: 1000, height: 1600, channels: 3, background: "#000" },
      })
        .jpeg()
        .toBuffer(),
    );
    expect((await post("/captions", form({}, big))).status).toBe(400);
  });
});

describe("POST /memes/prepare", () => {
  test("requires a session", async () => {
    expect((await prepare({}, null as unknown as string)).status).toBe(401);
  });

  test("stores the exact bytes under their hash with metadata", async () => {
    const { status, body } = await prepare();
    expect(status).toBe(201);
    const hash = sha256Hex(photo);
    expect(body).toMatchObject({
      imageHash: hash,
      imageUrl: `https://blobs.test/memes/${hash}.jpg`,
      metadataUri: `https://blobs.test/memes/${hash}.json`,
      name: "Laser Eyes On",
      symbol: "LASER",
    });
    expect(body.attestation.signature).toBeString();
    expect(await blobs.get(`memes/${hash}.jpg`)).toEqual(photo);
    const metadata = JSON.parse(
      new TextDecoder().decode(await blobs.get(`memes/${hash}.json`)),
    );
    expect(metadata).toMatchObject({
      name: "Laser Eyes On",
      symbol: "LASER",
      description: "Snapped on Flicko. Snap it. Caption it. Trade it.",
      image: body.imageUrl,
      external_url: "https://flicko.app",
      attributes: [
        { trait_type: "top", value: "LASER EYES ON" },
        { trait_type: "bottom", value: "DEV IS SHOOK" },
        { trait_type: "creator", value: alice },
      ],
    });
    const [row] = await db
      .select()
      .from(uploads)
      .where(eq(uploads.id, body.uploadId));
    expect(row).toMatchObject({
      wallet: alice,
      status: "finalized",
      imageHash: hash,
      captionTop: "LASER EYES ON",
    });
    expect(analysed).toBe(1);
  });

  test("allows an empty caption", async () => {
    const { status } = await prepare({ caption: "{}" });
    expect(status).toBe(201);
  });

  test("validates name and symbol", async () => {
    expect((await prepare({ symbol: "TOO-LONG-SYM" })).status).toBe(400);
    expect((await prepare({ name: "" })).status).toBe(400);
    expect((await prepare({ name: "x".repeat(33) })).status).toBe(400);
  });

  test("rejects unsafe photos and flagged text", async () => {
    verdict = { safe: false, reason: "nope", captions: [] };
    expect((await prepare()).status).toBe(422);
    verdict = SAFE;
    flagged = true;
    expect((await prepare()).body.error).toBe("caption rejected");
  });

  test("limits each wallet to 10 launches an hour", async () => {
    const wallet = testWallet().address;
    tokens[wallet] = (await sessions.issue(wallet)).token;
    for (let i = 0; i < 10; i++) {
      expect((await prepare({}, wallet)).status).toBe(201);
    }
    expect((await prepare({}, wallet)).status).toBe(429);
  });
});

describe("POST /memes/confirm", () => {
  const confirm = (wallet: string, mint = fixture.mint) =>
    post("/memes/confirm", { signature: CREATE_TX.signature, mint }, wallet);

  test("404 until the transaction is visible", async () => {
    const { status } = await post(
      "/memes/confirm",
      { signature: "1".repeat(64), mint: fixture.mint },
      CREATOR,
    );
    expect(status).toBe(404);
  });

  test("only the creator can confirm, and only for a prepared image", async () => {
    expect((await confirm(alice)).status).toBe(403);
    expect((await confirm(CREATOR)).status).toBe(422);
    expect(
      (await confirm(CREATOR, Keypair.generate().publicKey.toBase58())).status,
    ).toBe(422);
  });

  test("indexes the meme with the prepared image", async () => {
    await db.insert(uploads).values({
      wallet: CREATOR,
      rawKey: `memes/${SMOKE_HASH}.jpg`,
      imageHash: SMOKE_HASH,
      imageUrl: `https://blobs.test/memes/${SMOKE_HASH}.jpg`,
      captionTop: "GM",
      status: "finalized",
    });
    const { status, body } = await confirm(CREATOR);
    expect(status).toBe(200);
    expect(body).toEqual({
      mint: fixture.mint,
      signature: CREATE_TX.signature,
      imageHash: SMOKE_HASH,
    });
    const [meme] = await db
      .select()
      .from(memes)
      .where(eq(memes.mint, fixture.mint));
    expect(meme).toMatchObject({
      creator: CREATOR,
      imageUrl: `https://blobs.test/memes/${SMOKE_HASH}.jpg`,
      captionTop: "GM",
    });
    // Confirming again (or the indexer catching it) changes nothing.
    expect((await confirm(CREATOR)).status).toBe(200);
  });
});
