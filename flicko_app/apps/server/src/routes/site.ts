import { Router } from "express";
import { join } from "node:path";
import type { Db } from "../db/types";
import { isSolanaAddress } from "../http/validate";
import { getMeme } from "../queries/memes";

/*
 * The public website on the app's domain (getflicko.tech):
 * - `/.well-known/assetlinks.json` lets Android verify the app's App Links, so a shared
 *   `/m/<mint>` or `/u/<handle>` link opens Flicko directly when it is installed;
 * - `/m/:mint`, `/u/:handle` and `/` are the fallback pages for everyone else: a preview
 *   (with Open Graph tags for chat apps), "Open in Flicko" and the download link;
 * - `/favicon.png` is the icon wallets show when the app asks to connect.
 */
export interface SiteDeps {
  db: Db;
  /** e.g. https://getflicko.tech */
  siteUrl: string;
  androidPackage: string;
  /** SHA-256 fingerprints of the app's signing certificates (AA:BB:...) */
  androidCertFingerprints: string[];
  /** where the APK (or store listing) lives; the pages hide the button without it */
  appDownloadUrl?: string;
}

const ICON = join(import.meta.dir, "../../assets/site/icon.png");

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

// Pages only load their (S3) images; no scripts.
const CSP =
  "default-src 'none'; img-src 'self' https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

interface Page {
  title: string;
  description: string;
  url: string;
  image: string | null;
  heading: string;
  sub: string;
  /** app route for the "Open in Flicko" intent, e.g. meme/<mint> */
  appPath: string;
}

const render = (deps: SiteDeps, page: Page) => {
  const download = deps.appDownloadUrl;
  // Opens the app if it is installed, otherwise falls back to the download (or this page).
  const intent = `intent://${page.appPath}#Intent;scheme=flicko;package=${deps.androidPackage};S.browser_fallback_url=${encodeURIComponent(download ?? page.url)};end`;
  const image = page.image ?? `${deps.siteUrl}/favicon.png`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(page.title)}</title>
<meta name="description" content="${escape(page.description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Flicko">
<meta property="og:title" content="${escape(page.title)}">
<meta property="og:description" content="${escape(page.description)}">
<meta property="og:url" content="${escape(page.url)}">
<meta property="og:image" content="${escape(image)}">
<meta name="twitter:card" content="${page.image ? "summary_large_image" : "summary"}">
<link rel="icon" href="/favicon.png">
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; background: #0E0B14; color: #F4F1FA;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    display: flex; align-items: center; justify-content: center; }
  main { width: 100%; max-width: 420px; padding: 32px 16px; box-sizing: border-box;
    display: flex; flex-direction: column; align-items: center; gap: 16px; text-align: center; }
  .art { width: 100%; border-radius: 20px; background: #17141F; }
  .logo { width: 72px; height: 72px; border-radius: 18px; }
  h1 { margin: 0; font-size: 28px; }
  p { margin: 0; color: #A79FB8; font-size: 15px; line-height: 1.5; }
  a.button { display: block; width: 100%; padding: 14px 0; border-radius: 999px;
    font-weight: 700; text-decoration: none; box-sizing: border-box; }
  .primary { background: #FF2D95; color: #fff; }
  .secondary { border: 1px solid #3A3248; color: #F4F1FA; }
  small { color: #6E6680; font-size: 12px; }
</style>
</head>
<body>
<main>
  ${page.image ? `<img class="art" src="${escape(page.image)}" alt="">` : `<img class="logo" src="/favicon.png" alt="Flicko">`}
  <h1>${escape(page.heading)}</h1>
  <p>${escape(page.sub)}</p>
  <a class="button primary" href="${escape(intent)}">Open in Flicko</a>
  ${download ? `<a class="button secondary" href="${escape(download)}">Download for Android</a>` : ""}
  <small>Flicko runs on Solana devnet with test SKR.</small>
</main>
</body>
</html>`;
};

export const siteRouter = (deps: SiteDeps) => {
  const send = (res: import("express").Response, status: number, page: Page) => {
    res
      .status(status)
      .setHeader("Content-Security-Policy", CSP)
      .setHeader("Cache-Control", "public, max-age=300")
      .type("html")
      .send(render(deps, page));
  };

  const home: Page = {
    title: "Flicko: snap it, caption it, trade it",
    description: "Every photo becomes a memecoin priced in SKR.",
    url: deps.siteUrl,
    image: null,
    heading: "Flicko",
    sub: "Snap it. Caption it. Trade it. Every photo becomes a memecoin priced in SKR.",
    appPath: "",
  };

  return Router()
    .get("/.well-known/assetlinks.json", (_req, res) => {
      res.json([
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: deps.androidPackage,
            sha256_cert_fingerprints: deps.androidCertFingerprints,
          },
        },
      ]);
    })
    .get("/favicon.png", (_req, res) => {
      res.setHeader("Cache-Control", "public, max-age=86400").sendFile(ICON);
    })
    .get("/", (_req, res) => send(res, 200, home))
    .get("/m/:mint", async (req, res) => {
      const { mint } = req.params;
      const meme = isSolanaAddress(mint) ? await getMeme(deps.db, mint) : null;
      if (!meme || meme.hidden) {
        send(res, 404, { ...home, heading: "Meme not found", sub: "It may have been removed." });
        return;
      }
      const caption = [meme.captionTop, meme.captionBottom].filter(Boolean).join(" / ");
      send(res, 200, {
        title: `$${meme.symbol} on Flicko`,
        description: caption || `${meme.name}, a memecoin on Flicko`,
        url: `${deps.siteUrl}/m/${mint}`,
        image: meme.imageUrl,
        heading: `$${meme.symbol}`,
        sub: caption || meme.name,
        appPath: `meme/${mint}`,
      });
    })
    .get("/u/:handle", (req, res) => {
      const handle = req.params.handle.replace(/^@/, "").slice(0, 64);
      send(res, 200, {
        title: `@${handle} on Flicko`,
        description: `See @${handle}'s memes on Flicko.`,
        url: `${deps.siteUrl}/u/${encodeURIComponent(handle)}`,
        image: null,
        heading: `@${handle}`,
        sub: "See their memes and trades on Flicko.",
        appPath: `u/${encodeURIComponent(handle)}`,
      });
    });
};
