import { and, eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import type { Sessions } from "../auth/jwt";
import { likes } from "../db/schema";
import type { Db } from "../db/types";
import { parseOr400, solanaAddress } from "../http/validate";
import { requireAuth, walletOf } from "../middleware/auth";
import { HttpError } from "../middleware/errors";
import { memeExists } from "../queries/memes";

const mintParams = z.object({ mint: solanaAddress });

/*
 * Feed likes. PUT and DELETE /memes/:mint/like are idempotent and Bearer-only; the
 * feed returns each card's likeCount and the viewer's likedByMe.
 */
export const likesRouter = (deps: { db: Db; sessions: Sessions }) => {
  const auth = requireAuth(deps.sessions);
  return Router()
    .put("/memes/:mint/like", auth, async (req, res) => {
      const { mint } = parseOr400(mintParams, req.params);
      if (!(await memeExists(deps.db, mint))) {
        throw new HttpError(404, "meme not found");
      }
      await deps.db
        .insert(likes)
        .values({ wallet: walletOf(res), mint })
        .onConflictDoNothing();
      res.status(204).end();
    })
    .delete("/memes/:mint/like", auth, async (req, res) => {
      const { mint } = parseOr400(mintParams, req.params);
      await deps.db
        .delete(likes)
        .where(and(eq(likes.wallet, walletOf(res)), eq(likes.mint, mint)));
      res.status(204).end();
    });
};
