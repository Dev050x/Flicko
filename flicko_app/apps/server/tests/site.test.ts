import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Keypair } from "@solana/web3.js";
import { createApp } from "../src/app";
import { memes, users } from "../src/db/schema";
import { migratedDb, serve } from "./support";

/* The public site: App Links verification and the share pages. */
const key = () => Keypair.generate().publicKey.toBase58();
const mint = key();
const creator = key();
const FINGERPRINT = "AB:CD:EF";
let url = "";
let close = () => {};

beforeAll(async () => {
  const db = await migratedDb();
  await db.insert(users).values({ wallet: creator });
  await db.insert(memes).values({
    mint,
    memePda: key(),
    creator,
    name: "Moon <Cat>",
    symbol: "MOON",
    uri: "https://example.com/meta.json",
    imageHash: "00".repeat(32),
    totalSupply: "1500000000000",
    startPrice: "1000",
    price: "1000",
    imageUrl: "https://blobs.test/memes/moon.jpg",
    captionTop: "when the dev",
    captionBottom: "\"buys\" back",
    createdSlot: 1,
  });
  ({ url, close } = await serve(
    createApp({
      corsOrigin: "*",
      health: { ping: async () => {}, cluster: "devnet", programId: "p", skrMint: "s" },
      site: {
        db,
        siteUrl: "https://getflicko.tech",
        androidPackage: "app.flicko.mobile",
        androidCertFingerprints: [FINGERPRINT],
        appDownloadUrl: "https://example.com/flicko.apk",
      },
    }),
  ));
});

afterAll(() => close());

describe("site", () => {
  test("assetlinks.json names the package and signing fingerprints", async () => {
    const res = await fetch(`${url}/.well-known/assetlinks.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "app.flicko.mobile",
          sha256_cert_fingerprints: [FINGERPRINT],
        },
      },
    ]);
  });

  test("a meme page has the preview, the app intent and the download link", async () => {
    const res = await fetch(`${url}/m/${mint}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("img-src 'self' https:");
    const html = await res.text();
    expect(html).toContain("<title>$MOON on Flicko</title>");
    expect(html).toContain('property="og:image" content="https://blobs.test/memes/moon.jpg"');
    expect(html).toContain(`intent://meme/${mint}#Intent;scheme=flicko;package=app.flicko.mobile;`);
    expect(html).toContain('href="https://example.com/flicko.apk"');
    // Captions are user text: escaped.
    expect(html).toContain("when the dev / &quot;buys&quot; back");
    expect(html).not.toContain('"buys"');
  });

  test("unknown or malformed mints get a 404 page", async () => {
    expect((await fetch(`${url}/m/${key()}`)).status).toBe(404);
    expect((await fetch(`${url}/m/not-a-mint`)).status).toBe(404);
  });

  test("profile and home pages render, with handles escaped", async () => {
    const profile = await fetch(`${url}/u/${encodeURIComponent("<b>bob")}`);
    expect(profile.status).toBe(200);
    const html = await profile.text();
    expect(html).toContain("@&lt;b&gt;bob");
    expect(html).not.toContain("<b>bob");
    expect((await fetch(`${url}/`)).status).toBe(200);
    const icon = await fetch(`${url}/favicon.png`);
    expect(icon.status).toBe(200);
    expect(icon.headers.get("content-type")).toBe("image/png");
  });
});
