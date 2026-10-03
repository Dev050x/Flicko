import { and, count, desc, eq, gt, sql } from "drizzle-orm";
import { Router } from "express";
import sharp from "sharp";
import { z } from "zod";
import { CaptionAiError, type CaptionAi } from "../ai/captions";
import type { Attestor } from "../attest/attestor";
import type { Sessions } from "../auth/jwt";
import { uploads } from "../db/schema";
import type { Db } from "../db/types";
import { fileField, readForm, textFields } from "../http/multipart";
import { parseOr400, solanaAddress } from "../http/validate";
import { applyTransaction } from "../indexer/apply";
import type { ChainSource } from "../indexer/chain";
import type { FlickoEvent } from "../indexer/events";
import { preview, sha256Hex } from "../media/imaging";
import { fitsName } from "../media/naming";
import { optionalAuth, requireAuth, walletOf, viewerOf } from "../middleware/auth";
import { HttpError } from "../middleware/errors";
import type { BlobStore } from "../storage/blobs";

/*
 * The app's create flow. The phone flattens the finished meme itself (photo, edits and
 * caption), so the server stores exactly the bytes it gets: the on-chain image hash is
 * the SHA-256 of the file people see.
 *
 * - POST /captions (multipart image, optional Bearer): safety check + 3 captions.
 * - POST /memes/prepare (multipart image, name, symbol, caption; Bearer): safety check
 *   again, store memes/<hash>.jpg + .json, sign the create attestation.
 * - POST /memes/confirm {signature, mint} (Bearer): read the confirmed transaction and
 *   index it now, so the feed shows the meme without waiting for the indexer.
 */
export interface CreateDeps {
  db: Db;
  sessions: Sessions;
  blobs: BlobStore;
  ai: CaptionAi;
  attestor: Attestor;
  chain: Pick<ChainSource, "transaction" | "loadMemeState">;
  decode: (logs: string[]) => FlickoEvent[];
  /** the meme metadata's external_url */
  siteUrl: string;
  now?: () => number;
}

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_FORM_BYTES = MAX_PHOTO_BYTES + 64 * 1024;
const MAX_LONG_EDGE = 1440;
const LAUNCHES_PER_HOUR = 10;
const CAPTIONS_PER_HOUR = 40;
const MAX_URI_LENGTH = 200;
const DESCRIPTION = "Snapped on Flicko. Snap it. Caption it. Trade it.";

const captionLine = z
  .string()
  .trim()
  .max(32)
  .transform((line) => line.replace(/\s+/g, " ").toUpperCase());

const captionField = z
  .string()
  .default("{}")
  .transform((raw, ctx) => {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "caption must be json" });
      return z.NEVER;
    }
  })
  .pipe(
    z.object({
      top: captionLine.default(""),
      bottom: captionLine.default(""),
    }),
  );

const prepareFields = z.object({
  name: z.string().trim().refine(fitsName, "name must be 1-32 bytes"),
  symbol: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,10}$/, "symbol must be 1-10 letters or digits"),
  caption: captionField,
});

const confirmBody = z.object({
  signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/, "bad signature"),
  mint: solanaAddress,
});

const aiCall = async <T>(call: () => Promise<T>) => {
  try {
    return await call();
  } catch (err) {
    if (err instanceof CaptionAiError) {
      console.error(`[ai] ${err.message}`);
      throw new HttpError(502, "caption service unavailable");
    }
    throw err;
  }
};

/* JPEG only, at most 1440px on the long edge (what the app exports). */
const checkPhoto = async (bytes: Uint8Array) => {
  if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) {
    throw new HttpError(413, "photo must be between 1 byte and 8 MB");
  }
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    meta = await sharp(bytes).metadata();
  } catch {
    throw new HttpError(400, "not an image");
  }
  if (meta.format !== "jpeg" || !meta.width || !meta.height) {
    throw new HttpError(400, "photo must be a jpeg");
  }
  if (Math.max(meta.width, meta.height) > MAX_LONG_EDGE) {
    throw new HttpError(400, `photo must be at most ${MAX_LONG_EDGE}px`);
  }
};

/* Sliding one-hour window per key, in memory (one server instance). */
const hourlyLimit = (max: number, now: () => number) => {
  const hits = new Map<string, number[]>();
  return (key: string) => {
    const since = now() - 3_600_000;
    const recent = (hits.get(key) ?? []).filter((t) => t > since);
    if (recent.length >= max) {
      throw new HttpError(429, "too many requests, try again later");
    }
    recent.push(now());
    hits.set(key, recent);
  };
};

export const createRouter = (deps: CreateDeps) => {
  const now = deps.now ?? Date.now;
  const captionLimit = hourlyLimit(CAPTIONS_PER_HOUR, now);

  const review = async (photo: Uint8Array) => {
    const result = await aiCall(async () => deps.ai.analyse(await preview(photo)));
    if (!result.safe) throw new HttpError(422, "image rejected");
    return result;
  };

  return Router()
    .post("/captions", optionalAuth(deps.sessions), async (req, res) => {
      captionLimit(viewerOf(res) ?? req.ip ?? "unknown");
      const photo = await fileField(await readForm(req, MAX_FORM_BYTES), "image");
      await checkPhoto(photo);
      const result = await review(photo);
      res.json({ safe: true, captions: result.captions });
    })
    .post("/memes/prepare", requireAuth(deps.sessions), async (req, res) => {
      const wallet = walletOf(res);
      const [recent] = await deps.db
        .select({ n: count() })
        .from(uploads)
        .where(
          and(
            eq(uploads.wallet, wallet),
            eq(uploads.status, "finalized"),
            gt(uploads.createdAt, sql`now() - interval '1 hour'`),
          ),
        );
      if ((recent?.n ?? 0) >= LAUNCHES_PER_HOUR) {
        throw new HttpError(429, "too many launches, try again later");
      }

      const form = await readForm(req, MAX_FORM_BYTES);
      const fields = parseOr400(prepareFields, textFields(form));
      const photo = await fileField(form, "image");
      await checkPhoto(photo);
      await review(photo);
      const { top, bottom } = fields.caption;
      const flagged = await aiCall(() =>
        deps.ai.moderateText(
          [top, bottom, fields.name, fields.symbol].filter(Boolean).join("\n"),
        ),
      );
      if (flagged) throw new HttpError(422, "caption rejected");

      const imageHash = sha256Hex(photo);
      const imageKey = `memes/${imageHash}.jpg`;
      const metadataKey = `memes/${imageHash}.json`;
      const imageUrl = deps.blobs.publicUrl(imageKey);
      const metadataUri = deps.blobs.publicUrl(metadataKey);
      if (metadataUri.length > MAX_URI_LENGTH) {
        throw new Error(`metadata uri is longer than ${MAX_URI_LENGTH}`);
      }

      await deps.blobs.put(imageKey, photo, "image/jpeg");
      await deps.blobs.put(
        metadataKey,
        JSON.stringify({
          name: fields.name,
          symbol: fields.symbol,
          description: DESCRIPTION,
          image: imageUrl,
          external_url: deps.siteUrl,
          properties: {
            files: [{ uri: imageUrl, type: "image/jpeg" }],
            category: "image",
          },
          attributes: [
            { trait_type: "top", value: top },
            { trait_type: "bottom", value: bottom },
            { trait_type: "creator", value: wallet },
          ],
        }),
        "application/json",
      );
      const [upload] = await deps.db
        .insert(uploads)
        .values({
          wallet,
          rawKey: imageKey,
          finalKey: imageKey,
          imageHash,
          imageUrl,
          metadataUri,
          name: fields.name,
          symbol: fields.symbol,
          captionTop: top || null,
          captionBottom: bottom || null,
          status: "finalized",
        })
        .returning({ id: uploads.id });

      res.status(201).json({
        uploadId: upload!.id,
        metadataUri,
        imageUrl,
        imageHash,
        name: fields.name,
        symbol: fields.symbol,
        attestation: deps.attestor.attest({
          creator: wallet,
          imageHash,
          name: fields.name,
          symbol: fields.symbol,
          uri: metadataUri,
        }),
      });
    })
    .post("/memes/confirm", requireAuth(deps.sessions), async (req, res) => {
      const wallet = walletOf(res);
      const { signature, mint } = parseOr400(confirmBody, req.body);
      const tx = await deps.chain.transaction(signature);
      if (!tx) throw new HttpError(404, "transaction not found yet");
      if (tx.err) throw new HttpError(422, "transaction failed");

      const created = deps
        .decode(tx.logs)
        .find(
          (event): event is Extract<FlickoEvent, { kind: "memeCreated" }> =>
            event.kind === "memeCreated" && event.mint === mint,
        );
      if (!created) throw new HttpError(422, "no meme created for this mint");
      if (created.creator !== wallet) {
        throw new HttpError(403, "meme was created by another wallet");
      }
      const [upload] = await deps.db
        .select({ id: uploads.id })
        .from(uploads)
        .where(
          and(
            eq(uploads.wallet, wallet),
            eq(uploads.imageHash, created.imageHash),
            eq(uploads.status, "finalized"),
          ),
        )
        .orderBy(desc(uploads.createdAt))
        .limit(1);
      if (!upload) {
        throw new HttpError(422, "image hash does not match a prepared upload");
      }

      await applyTransaction(
        { db: deps.db, decode: deps.decode, loadMemeState: deps.chain.loadMemeState },
        tx,
      );
      res.json({ mint, signature, imageHash: created.imageHash });
    });
};
