import { and, count, eq, gt, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { CaptionAiError, type CaptionAi } from "../ai/captions";
import type { Sessions } from "../auth/jwt";
import { uploads } from "../db/schema";
import type { Db } from "../db/types";
import { parseOr400 } from "../http/validate";
import { normalise, preview, renderMeme, sha256Hex } from "../media/imaging";
import { fitsName, suggestName, suggestSymbol } from "../media/naming";
import { requireAuth, walletOf } from "../middleware/auth";
import { HttpError } from "../middleware/errors";
import type { BlobStore } from "../storage/blobs";

export interface UploadDeps {
  db: Db;
  sessions: Sessions;
  blobs: BlobStore;
  ai: CaptionAi;
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const UPLOADS_PER_HOUR = 20;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const UPLOAD_URL_TTL_SECONDS = 300;
const MAX_URI_LENGTH = 200;
const DESCRIPTION = "Made on Flicko. Snap it. Caption it. Trade it.";

const captionLine = z
  .string()
  .trim()
  .max(60)
  .transform((line) => line.replace(/\s+/g, " ").toUpperCase());

const createBody = z.object({ contentType: z.enum(IMAGE_TYPES) });
const uploadParams = z.object({ id: z.uuid() });

const finalizeBody = z
  .object({
    top: captionLine,
    bottom: captionLine,
    name: z
      .string()
      .trim()
      .refine(fitsName, "name must be 1-32 bytes")
      .optional(),
    symbol: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{1,10}$/, "symbol must be 1-10 letters or digits")
      .optional(),
  })
  .refine((body) => body.top || body.bottom, "caption cannot be empty");

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

export const uploadsRouter = (deps: UploadDeps) => {
  const auth = requireAuth(deps.sessions);

  const ownUpload = async (params: unknown, wallet: string) => {
    const { id } = parseOr400(uploadParams, params);
    const [upload] = await deps.db
      .select()
      .from(uploads)
      .where(and(eq(uploads.id, id), eq(uploads.wallet, wallet)));
    if (!upload) throw new HttpError(404, "upload not found");
    if (upload.status === "rejected") {
      throw new HttpError(409, "upload was rejected");
    }
    return upload;
  };

  return Router()
    .use("/uploads", auth)
    .post("/uploads", async (req, res) => {
      const { contentType } = parseOr400(createBody, req.body);
      const wallet = walletOf(res);
      const [recent] = await deps.db
        .select({ n: count() })
        .from(uploads)
        .where(
          and(
            eq(uploads.wallet, wallet),
            gt(uploads.createdAt, sql`now() - interval '1 hour'`),
          ),
        );
      if ((recent?.n ?? 0) >= UPLOADS_PER_HOUR) {
        throw new HttpError(429, "too many uploads, try again later");
      }

      const id = crypto.randomUUID();
      const rawKey = `incoming/${id}`;
      await deps.db.insert(uploads).values({ id, wallet, rawKey });
      res.status(201).json({
        uploadId: id,
        uploadUrl: deps.blobs.presignPut(
          rawKey,
          contentType,
          UPLOAD_URL_TTL_SECONDS,
        ),
        method: "PUT",
        headers: { "Content-Type": contentType },
        maxBytes: MAX_PHOTO_BYTES,
        expiresAt: new Date(
          Date.now() + UPLOAD_URL_TTL_SECONDS * 1000,
        ).toISOString(),
      });
    })
    .post("/uploads/:id/analyse", async (req, res) => {
      const upload = await ownUpload(req.params, walletOf(res));
      if (upload.captions) {
        res.json({ uploadId: upload.id, captions: upload.captions });
        return;
      }

      const incomingKey = `incoming/${upload.id}`;
      const size = await deps.blobs.size(incomingKey);
      if (size === null) throw new HttpError(409, "photo not uploaded yet");
      if (size === 0 || size > MAX_PHOTO_BYTES) {
        await deps.blobs.delete(incomingKey);
        throw new HttpError(413, "photo must be between 1 byte and 8 MB");
      }

      const photo = await normalise(await deps.blobs.get(incomingKey));
      const rawKey = `raw/${upload.id}.jpg`;
      await deps.blobs.put(rawKey, photo, "image/jpeg");
      await deps.blobs.delete(incomingKey);
      await deps.db
        .update(uploads)
        .set({ rawKey })
        .where(eq(uploads.id, upload.id));

      const result = await aiCall(async () =>
        deps.ai.analyse(await preview(photo)),
      );
      if (!result.safe) {
        await deps.db
          .update(uploads)
          .set({ status: "rejected" })
          .where(eq(uploads.id, upload.id));
        res
          .status(422)
          .json({ error: "image rejected", reason: result.reason });
        return;
      }
      await deps.db
        .update(uploads)
        .set({ captions: result.captions })
        .where(eq(uploads.id, upload.id));
      res.json({ uploadId: upload.id, captions: result.captions });
    })
    .post("/uploads/:id/finalize", async (req, res) => {
      const upload = await ownUpload(req.params, walletOf(res));
      const body = parseOr400(finalizeBody, req.body);
      if (!upload.captions) throw new HttpError(409, "upload has no captions");

      const suggested = upload.captions.some(
        (caption) => caption.top === body.top && caption.bottom === body.bottom,
      );
      if (!suggested) {
        const flagged = await aiCall(() =>
          deps.ai.moderateText(`${body.top}\n${body.bottom}`),
        );
        if (flagged) throw new HttpError(422, "caption rejected");
      }

      const name = body.name ?? suggestName(body.top, body.bottom);
      const symbol = body.symbol ?? suggestSymbol(body.top, body.bottom);
      const image = await renderMeme(
        await deps.blobs.get(upload.rawKey),
        body.top,
        body.bottom,
      );
      const imageHash = sha256Hex(image);
      const imageKey = `memes/${imageHash}.jpg`;
      const metadataKey = `memes/${imageHash}.json`;
      const imageUrl = deps.blobs.publicUrl(imageKey);
      const uri = deps.blobs.publicUrl(metadataKey);
      if (uri.length > MAX_URI_LENGTH) {
        throw new Error(`metadata uri is longer than ${MAX_URI_LENGTH}`);
      }

      await deps.blobs.put(imageKey, image, "image/jpeg");
      await deps.blobs.put(
        metadataKey,
        JSON.stringify({
          name,
          symbol,
          description: DESCRIPTION,
          image: imageUrl,
          properties: {
            files: [{ uri: imageUrl, type: "image/jpeg" }],
            category: "image",
          },
          attributes: [
            { trait_type: "top", value: body.top },
            { trait_type: "bottom", value: body.bottom },
          ],
        }),
        "application/json",
      );
      await deps.db
        .update(uploads)
        .set({
          finalKey: imageKey,
          imageHash,
          imageUrl,
          metadataUri: uri,
          captionTop: body.top || null,
          captionBottom: body.bottom || null,
          name,
          symbol,
          status: "finalized",
        })
        .where(eq(uploads.id, upload.id));
      res.json({ uploadId: upload.id, imageUrl, uri, imageHash, name, symbol });
    });
};
