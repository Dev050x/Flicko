import { and, eq, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import type { Sessions } from "../auth/jwt";
import { follows } from "../db/schema";
import type { Db } from "../db/types";
import { parseOr400 } from "../http/validate";
import { requireAuth, walletOf } from "../middleware/auth";
import { HttpError } from "../middleware/errors";
import { resolveWallet } from "../queries/profiles";

const idParams = z.object({ id: z.string().trim().min(1).max(64) });

/*
 * Creator follows. PUT and DELETE /users/:id/follow (a wallet or a username) are
 * idempotent and Bearer-only; GET /me/following lists who the viewer follows.
 */
export const followsRouter = (deps: { db: Db; sessions: Sessions }) => {
  const auth = requireAuth(deps.sessions);
  return Router()
    .put("/users/:id/follow", auth, async (req, res) => {
      const wallet = await resolveWallet(
        deps.db,
        parseOr400(idParams, req.params).id,
      );
      if (wallet === walletOf(res)) {
        throw new HttpError(400, "you can't follow yourself");
      }
      await deps.db
        .insert(follows)
        .values({ follower: walletOf(res), followee: wallet })
        .onConflictDoNothing();
      res.status(204).end();
    })
    .delete("/users/:id/follow", auth, async (req, res) => {
      const wallet = await resolveWallet(
        deps.db,
        parseOr400(idParams, req.params).id,
      );
      await deps.db
        .delete(follows)
        .where(
          and(
            eq(follows.follower, walletOf(res)),
            eq(follows.followee, wallet),
          ),
        );
      res.status(204).end();
    })
    .get("/me/following", auth, async (_req, res) => {
      const rows = await deps.db
        .select({ wallet: follows.followee })
        .from(follows)
        .where(eq(follows.follower, walletOf(res)))
        .orderBy(sql`${follows.createdAt} desc`);
      res.json({ wallets: rows.map((row) => row.wallet) });
    });
};
