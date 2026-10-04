import { eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import type { Sessions } from "../auth/jwt";
import { users } from "../db/schema";
import type { Db } from "../db/types";
import { parseOr400 } from "../http/validate";
import { avatarImage, sha256Hex } from "../media/imaging";
import { requireAuth, walletOf } from "../middleware/auth";
import { HttpError } from "../middleware/errors";
import type { BlobStore } from "../storage/blobs";

export interface AvatarDeps {
  db: Db;
  sessions: Sessions;
  blobs: BlobStore;
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const UPLOAD_URL_TTL_SECONDS = 300;
const UPLOADS_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;

const uploadBody = z.object({ contentType: z.enum(IMAGE_TYPES) });
const saveBody = z.object({ uploadId: z.uuid() });

const incomingKey = (wallet: string, id: string) =>
  `incoming/avatars/${wallet}/${id}`;

/*
 * Profile photo upload. The phone PUTs the file straight to storage with a presigned URL
 * (POST /me/avatar/upload), then PUT /me/avatar crops it to a square, stores it publicly
 * at avatars/<sha256>.jpg and sets it as the user's avatar (clearing any bundled one).
 * The incoming key carries the wallet, so a user can only save their own uploads.
 */
export const avatarRouter = (deps: AvatarDeps) => {
  const recent = new Map<string, number[]>();

  return Router()
    .use("/me/avatar", requireAuth(deps.sessions))
    .post("/me/avatar/upload", (req, res) => {
      const { contentType } = parseOr400(uploadBody, req.body);
      const wallet = walletOf(res);
      const now = Date.now();
      const times = (recent.get(wallet) ?? []).filter((t) => now - t < HOUR_MS);
      if (times.length >= UPLOADS_PER_HOUR) {
        throw new HttpError(429, "too many uploads, try again later");
      }
      recent.set(wallet, [...times, now]);

      const id = crypto.randomUUID();
      res.status(201).json({
        uploadId: id,
        uploadUrl: deps.blobs.presignPut(
          incomingKey(wallet, id),
          contentType,
          UPLOAD_URL_TTL_SECONDS,
        ),
        method: "PUT",
        headers: { "Content-Type": contentType },
        maxBytes: MAX_AVATAR_BYTES,
        expiresAt: new Date(now + UPLOAD_URL_TTL_SECONDS * 1000).toISOString(),
      });
    })
    .put("/me/avatar", async (req, res) => {
      const { uploadId } = parseOr400(saveBody, req.body);
      const wallet = walletOf(res);
      const key = incomingKey(wallet, uploadId);
      const size = await deps.blobs.size(key);
      if (size === null) throw new HttpError(409, "photo not uploaded yet");
      if (size === 0 || size > MAX_AVATAR_BYTES) {
        await deps.blobs.delete(key);
        throw new HttpError(413, "photo must be between 1 byte and 5 MB");
      }

      const image = await avatarImage(await deps.blobs.get(key));
      const imageKey = `avatars/${sha256Hex(image)}.jpg`;
      await deps.blobs.put(imageKey, image, "image/jpeg");
      await deps.blobs.delete(key);

      const [user] = await deps.db
        .update(users)
        .set({ avatarUrl: deps.blobs.publicUrl(imageKey), avatarId: null })
        .where(eq(users.wallet, wallet))
        .returning();
      if (!user) throw new HttpError(404, "user not found");
      res.json({ user });
    });
};
