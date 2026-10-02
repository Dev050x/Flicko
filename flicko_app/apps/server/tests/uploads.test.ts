import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { attestationMessage } from "@flicko/sdk";
import { ed25519 } from "@noble/curves/ed25519.js";
import { Keypair, PublicKey } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import {
  CaptionAiError,
  type CaptionAi,
  type CaptionResult,
} from "../src/ai/captions";
import { createApp } from "../src/app";
import {
  ATTESTATION_TTL_SECONDS,
  createAttestor,
} from "../src/attest/attestor";
import { createSessions } from "../src/auth/jwt";
import { uploads } from "../src/db/schema";
import { sha256Hex } from "../src/media/imaging";
import { suggestName, suggestSymbol } from "../src/media/naming";
import { memoryBlobStore } from "../src/storage/blobs";
import { migratedDb, serve, testWallet } from "./support";

/*
 * One PGlite database and an in-memory blob store; the AI is a fake whose verdict each test sets.
 * The phone's direct PUT to S3 is simulated by writing incoming/<id> into the memory store.
 */
const SAFE: CaptionResult = {
  safe: true,
  reason: "",
  captions: [
    { top: "GM SER", bottom: "WEN MOON" },
    { top: "DIAMOND HANDS", bottom: "" },
    { top: "", bottom: "NGMI" },
  ],
};

let verdict: CaptionResult | Error = SAFE;
let flagged = false;
const ai: CaptionAi = {
  analyse: async () => {
    if (verdict instanceof Error) throw verdict;
    return verdict;
  },
  moderateText: async () => flagged,
};

const attestorKey = Keypair.generate();
let clock = Date.now();
const attestor = createAttestor(attestorKey.secretKey, () => clock);

/* Checks a returned attestation against the exact message the program rebuilds. */
const verifies = (
  attestation: { authority: string; signature: string; expiresAt: number },
  fields: {
    creator: string;
    imageHash: string;
    name: string;
    symbol: string;
    uri: string;
  },
) =>
  attestation.authority === attestorKey.publicKey.toBase58() &&
  ed25519.verify(
    Buffer.from(attestation.signature, "base64"),
    attestationMessage({
      creator: new PublicKey(fields.creator),
      imageHash: Buffer.from(fields.imageHash, "hex"),
      expiresAt: attestation.expiresAt,
      name: fields.name,
      symbol: fields.symbol,
      uri: fields.uri,
    }),
    attestorKey.publicKey.toBytes(),
  );

const sessions = createSessions("test-secret");
const blobs = memoryBlobStore();
const alice = testWallet().address;
const bob = testWallet().address;
let db: Awaited<ReturnType<typeof migratedDb>>;
let url = "";
let close = () => {};
let photo: Uint8Array;
let tokens: Record<string, string> = {};

const call = async (
  path: string,
  body: unknown = {},
  wallet: string | null = alice,
) => {
  const res = await fetch(`${url}${path}`, {
    method: "POST",
    headers: {
      ...(wallet ? { authorization: `Bearer ${tokens[wallet]}` } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
};

const createUpload = (wallet = alice) =>
  call("/uploads", { contentType: "image/jpeg" }, wallet);

/* Stands in for the phone's PUT to the presigned url. */
const putPhoto = (uploadId: string, bytes: Uint8Array = photo) =>
  blobs.put(`incoming/${uploadId}`, bytes, "image/jpeg");

const analyse = (uploadId: string, wallet = alice) =>
  call(`/uploads/${uploadId}/analyse`, {}, wallet);

const finalize = (uploadId: string, body: unknown, wallet = alice) =>
  call(`/uploads/${uploadId}/finalize`, body, wallet);

const analysed = async () => {
  const { body } = await createUpload();
  await putPhoto(body.uploadId);
  await analyse(body.uploadId);
  return body.uploadId as string;
};

const rowOf = async (id: string) =>
  (await db.select().from(uploads).where(eq(uploads.id, id)))[0]!;

beforeAll(async () => {
  db = await migratedDb();
  photo = new Uint8Array(
    await sharp({
      create: { width: 800, height: 600, channels: 3, background: "#4477aa" },
    })
      .jpeg()
      .toBuffer(),
  );
  tokens = {
    [alice]: (await sessions.issue(alice)).token,
    [bob]: (await sessions.issue(bob)).token,
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
      uploads: { db, sessions, blobs, ai, attestor },
    }),
  ));
});

beforeEach(() => {
  verdict = SAFE;
  flagged = false;
});

afterAll(() => close());

describe("POST /uploads", () => {
  test("requires a session", async () => {
    expect(
      (await call("/uploads", { contentType: "image/jpeg" }, null)).status,
    ).toBe(401);
  });

  test("returns a presigned PUT url for a pending upload", async () => {
    const { status, body } = await createUpload();
    expect(status).toBe(201);
    expect(body).toMatchObject({
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      maxBytes: 8 * 1024 * 1024,
    });
    expect(body.uploadUrl).toStartWith(
      `https://blobs.test/incoming/${body.uploadId}?method=PUT`,
    );
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(await rowOf(body.uploadId)).toMatchObject({
      wallet: alice,
      status: "pending",
      rawKey: `incoming/${body.uploadId}`,
      captions: null,
    });
  });

  test("only accepts image content types", async () => {
    expect(
      (await call("/uploads", { contentType: "application/pdf" })).status,
    ).toBe(400);
  });

  test("limits each wallet to 20 uploads an hour", async () => {
    await db.insert(uploads).values(
      Array.from({ length: 20 }, (_, i) => ({
        wallet: bob,
        rawKey: `incoming/bob-${i}`,
      })),
    );
    expect((await createUpload(bob)).status).toBe(429);
  });
});

describe("POST /uploads/:id/analyse", () => {
  test("409 until the photo is uploaded", async () => {
    const { body } = await createUpload();
    expect(await analyse(body.uploadId)).toMatchObject({
      status: 409,
      body: { error: "photo not uploaded yet" },
    });
  });

  test("normalises a safe photo, moves it to raw/ and returns captions", async () => {
    const { body: up } = await createUpload();
    await putPhoto(up.uploadId);
    const { status, body } = await analyse(up.uploadId);
    expect(status).toBe(200);
    expect(body.captions).toEqual(SAFE.captions);
    expect(blobs.keys()).toContain(`raw/${up.uploadId}.jpg`);
    expect(blobs.keys()).not.toContain(`incoming/${up.uploadId}`);
    expect(await rowOf(up.uploadId)).toMatchObject({
      status: "pending",
      rawKey: `raw/${up.uploadId}.jpg`,
      captions: SAFE.captions,
    });
  });

  test("is idempotent once captions exist", async () => {
    const id = await analysed();
    verdict = new CaptionAiError("would fail if called again");
    expect(await analyse(id)).toMatchObject({
      status: 200,
      body: { captions: SAFE.captions },
    });
  });

  test("rejects non-images and oversized files", async () => {
    const { body: junk } = await createUpload();
    await putPhoto(junk.uploadId, new Uint8Array([1, 2, 3, 4, 5]));
    expect(await analyse(junk.uploadId)).toMatchObject({
      status: 400,
      body: { error: "not an image" },
    });

    const { body: big } = await createUpload();
    await putPhoto(big.uploadId, new Uint8Array(8 * 1024 * 1024 + 1));
    expect((await analyse(big.uploadId)).status).toBe(413);
    expect(blobs.keys()).not.toContain(`incoming/${big.uploadId}`);
  });

  test("marks unsafe photos rejected and refuses to finalize them", async () => {
    verdict = { safe: false, reason: "gore", captions: [] };
    const { body: up } = await createUpload();
    await putPhoto(up.uploadId);
    expect(await analyse(up.uploadId)).toMatchObject({
      status: 422,
      body: { error: "image rejected", reason: "gore" },
    });
    expect((await rowOf(up.uploadId)).status).toBe("rejected");
    expect(
      (await finalize(up.uploadId, { top: "GM SER", bottom: "" })).status,
    ).toBe(409);
  });

  test("returns 502 when the caption service fails", async () => {
    verdict = new CaptionAiError("down");
    const { body: up } = await createUpload();
    await putPhoto(up.uploadId);
    expect(await analyse(up.uploadId)).toMatchObject({
      status: 502,
      body: { error: "caption service unavailable" },
    });
  });

  test("hides other wallets' uploads", async () => {
    const { body: up } = await createUpload();
    expect(await analyse(up.uploadId, bob)).toMatchObject({
      status: 404,
      body: { error: "upload not found" },
    });
    expect((await analyse("not-a-uuid")).status).toBe(400);
  });
});

describe("POST /uploads/:id/finalize", () => {
  test("signs an attestation the program will accept", async () => {
    const id = await analysed();
    const { body } = await finalize(id, { top: "GM SER", bottom: "WEN MOON" });
    const fields = { creator: alice, ...body };
    expect(body.attestation.expiresAt).toBe(
      Math.floor(clock / 1000) + ATTESTATION_TTL_SECONDS,
    );
    expect(verifies(body.attestation, fields)).toBe(true);
    expect(verifies(body.attestation, { ...fields, creator: bob })).toBe(false);
    expect(
      verifies(body.attestation, { ...fields, uri: "https://evil.example" }),
    ).toBe(false);
  });

  test("re-signs a finalized upload with a fresh expiry", async () => {
    const id = await analysed();
    const { body: done } = await finalize(id, { top: "GM SER", bottom: "" });
    clock += 3_600_000;
    const { status, body } = await call(`/uploads/${id}/attest`);
    expect(status).toBe(200);
    expect(body.attestation.expiresAt).toBe(
      Math.floor(clock / 1000) + ATTESTATION_TTL_SECONDS,
    );
    expect(verifies(body.attestation, { creator: alice, ...done })).toBe(true);
  });

  test("refuses to attest before finalize or for another wallet", async () => {
    const id = await analysed();
    expect(await call(`/uploads/${id}/attest`)).toMatchObject({
      status: 409,
      body: { error: "upload is not finalized" },
    });
    await finalize(id, { top: "GM SER", bottom: "" });
    expect((await call(`/uploads/${id}/attest`, {}, bob)).status).toBe(404);
  });

  test("409 before analyse", async () => {
    const { body: up } = await createUpload();
    expect(
      await finalize(up.uploadId, { top: "GM SER", bottom: "" }),
    ).toMatchObject({ status: 409, body: { error: "upload has no captions" } });
  });

  test("renders the suggested caption and stores image + metadata", async () => {
    const id = await analysed();
    const { status, body } = await finalize(id, {
      top: "gm  ser",
      bottom: "wen moon",
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({
      uploadId: id,
      name: "Gm Ser Wen Moon",
      symbol: "GSWM",
    });
    expect(body.imageHash).toMatch(/^[0-9a-f]{64}$/);
    expect(body.imageUrl).toBe(
      `https://blobs.test/memes/${body.imageHash}.jpg`,
    );
    expect(body.uri).toBe(`https://blobs.test/memes/${body.imageHash}.json`);
    expect(body.uri.length).toBeLessThanOrEqual(200);

    const image = await blobs.get(`memes/${body.imageHash}.jpg`);
    expect(sha256Hex(image)).toBe(body.imageHash);
    expect(blobs.contentType(`memes/${body.imageHash}.jpg`)).toBe("image/jpeg");

    const metadata = JSON.parse(
      new TextDecoder().decode(await blobs.get(`memes/${body.imageHash}.json`)),
    );
    expect(metadata).toMatchObject({
      name: "Gm Ser Wen Moon",
      symbol: "GSWM",
      image: body.imageUrl,
      properties: { category: "image" },
      attributes: [
        { trait_type: "top", value: "GM SER" },
        { trait_type: "bottom", value: "WEN MOON" },
      ],
    });

    expect(await rowOf(id)).toMatchObject({
      status: "finalized",
      imageHash: body.imageHash,
      imageUrl: body.imageUrl,
      metadataUri: body.uri,
      captionTop: "GM SER",
      captionBottom: "WEN MOON",
      name: "Gm Ser Wen Moon",
      symbol: "GSWM",
    });
  });

  test("moderates custom captions", async () => {
    const id = await analysed();
    flagged = true;
    expect(await finalize(id, { top: "bad words", bottom: "" })).toMatchObject({
      status: 422,
      body: { error: "caption rejected" },
    });
    flagged = false;
    const ok = await finalize(id, {
      top: "my own caption",
      bottom: "",
      name: "Custom",
      symbol: "cust",
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ name: "Custom", symbol: "CUST" });
  });

  test("hides other wallets' uploads and validates the body", async () => {
    const id = await analysed();
    expect(
      await finalize(id, { top: "GM SER", bottom: "" }, bob),
    ).toMatchObject({ status: 404, body: { error: "upload not found" } });
    expect(
      (
        await finalize(id, {
          top: "GM SER",
          bottom: "",
          symbol: "toolongsymbol1",
        })
      ).status,
    ).toBe(400);
    expect((await finalize(id, { top: " ", bottom: "" })).status).toBe(400);
    expect(
      (await finalize(id, { top: "GM SER", bottom: "", name: "😀".repeat(9) }))
        .status,
    ).toBe(400);
  });
});

describe("naming", () => {
  test("names fit in 32 bytes at a word boundary", () => {
    expect(suggestName("when the dip keeps", "dipping forever and ever")).toBe(
      "When The Dip Keeps Dipping",
    );
    expect(suggestName("", "")).toBe("Flicko Meme");
    expect(
      Buffer.byteLength(suggestName("😀😀😀😀 😀😀😀😀 😀😀😀😀", "")),
    ).toBeLessThanOrEqual(32);
  });

  test("symbols use initials, padded to three", () => {
    expect(suggestSymbol("gm ser", "wen moon")).toBe("GSWM");
    expect(suggestSymbol("one two three", "four five six")).toBe("OTTFF");
    expect(suggestSymbol("moon", "")).toBe("MFL");
    expect(suggestSymbol("😀", "")).toBe("FLK");
  });
});
