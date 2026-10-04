import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Keypair } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import type { CaptionAi } from "../src/ai/captions";
import { createApp } from "../src/app";
import { createAttestor } from "../src/attest/attestor";
import { createSessions } from "../src/auth/jwt";
import { users } from "../src/db/schema";
import { memoryBlobStore } from "../src/storage/blobs";
import { migratedDb, serve, testWallet } from "./support";

/*
 * Bundled avatar picks (PATCH /me) and photo uploads (presigned PUT, then PUT /me/avatar).
 * The phone's PUT to storage is simulated by writing the incoming key into the memory store.
 */
const ai: CaptionAi = {
  analyse: async () => ({ safe: true, reason: "", captions: [] }),
  moderateText: async () => false,
};
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
  method: string,
  path: string,
  body: unknown = {},
  wallet: string | null = alice,
) => {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: {
      ...(wallet ? { authorization: `Bearer ${tokens[wallet]}` } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
};

const userOf = async (wallet: string) =>
  (await db.select().from(users).where(eq(users.wallet, wallet)))[0]!;

const startUpload = (wallet = alice) =>
  call("POST", "/me/avatar/upload", { contentType: "image/jpeg" }, wallet);

beforeAll(async () => {
  db = await migratedDb();
  await db.insert(users).values([{ wallet: alice }, { wallet: bob }]);
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
      auth: {
        db,
        sessions,
        nonces: {} as never,
        policy: {} as never,
      },
      uploads: {
        db,
        sessions,
        blobs,
        ai,
        attestor: createAttestor(Keypair.generate().secretKey),
      },
    }),
  ));
});

afterAll(() => close());

describe("PATCH /me avatarId", () => {
  test("sets a bundled avatar", async () => {
    const { status, body } = await call("PATCH", "/me", { avatarId: "froggo" });
    expect(status).toBe(200);
    expect(body.user.avatarId).toBe("froggo");
    expect(body.user.avatarUrl).toBeNull();
  });

  test("rejects an unknown avatar", async () => {
    expect((await call("PATCH", "/me", { avatarId: "nope" })).status).toBe(400);
  });

  test("rejects an empty update", async () => {
    expect((await call("PATCH", "/me", {})).status).toBe(400);
  });
});

describe("photo avatars", () => {
  test("require a session", async () => {
    expect((await startUpload(null as never)).status).toBe(401);
    expect(
      (await call("PUT", "/me/avatar", { uploadId: crypto.randomUUID() }, null))
        .status,
    ).toBe(401);
  });

  test("returns a presigned PUT url under the wallet's incoming folder", async () => {
    const { status, body } = await startUpload();
    expect(status).toBe(201);
    expect(body.method).toBe("PUT");
    expect(body.uploadUrl).toContain(
      `incoming/avatars/${alice}/${body.uploadId}`,
    );
    expect(body.maxBytes).toBe(5 * 1024 * 1024);
  });

  test("409 until the photo is uploaded", async () => {
    const { body } = await startUpload();
    expect(
      (await call("PUT", "/me/avatar", { uploadId: body.uploadId })).status,
    ).toBe(409);
  });

  test("crops to a 512px square, stores it publicly and replaces the bundled avatar", async () => {
    await call("PATCH", "/me", { avatarId: "whale" });
    const { body } = await startUpload();
    const incoming = `incoming/avatars/${alice}/${body.uploadId}`;
    await blobs.put(incoming, photo, "image/jpeg");

    const saved = await call("PUT", "/me/avatar", { uploadId: body.uploadId });
    expect(saved.status).toBe(200);
    expect(saved.body.user.avatarId).toBeNull();
    expect(saved.body.user.avatarUrl).toMatch(
      /^https:\/\/blobs\.test\/avatars\/[0-9a-f]{64}\.jpg$/,
    );

    const key = saved.body.user.avatarUrl.replace("https://blobs.test/", "");
    const meta = await sharp(await blobs.get(key)).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([512, 512, "jpeg"]);
    expect(await blobs.size(incoming)).toBeNull();
    expect((await userOf(alice)).avatarUrl).toBe(saved.body.user.avatarUrl);
  });

  test("cannot save another wallet's upload", async () => {
    const { body } = await startUpload(bob);
    await blobs.put(
      `incoming/avatars/${bob}/${body.uploadId}`,
      photo,
      "image/jpeg",
    );
    expect(
      (await call("PUT", "/me/avatar", { uploadId: body.uploadId }, alice))
        .status,
    ).toBe(409);
  });

  test("rejects files that are not images", async () => {
    const { body } = await startUpload();
    await blobs.put(
      `incoming/avatars/${alice}/${body.uploadId}`,
      new TextEncoder().encode("not a photo"),
      "image/jpeg",
    );
    expect(
      (await call("PUT", "/me/avatar", { uploadId: body.uploadId })).status,
    ).toBe(400);
  });

  test("picking a bundled avatar clears the photo", async () => {
    const { body } = await call("PATCH", "/me", { avatarId: "pup" });
    expect(body.user.avatarId).toBe("pup");
    expect(body.user.avatarUrl).toBeNull();
  });

  test("limits uploads per hour", async () => {
    let status = 0;
    for (let i = 0; i < 10; i++) status = (await startUpload(bob)).status;
    expect(status).toBe(429);
  });
});
