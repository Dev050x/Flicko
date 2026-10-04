import { and, eq, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import type { Sessions } from "../auth/jwt";
import { follows, users } from "../db/schema";
import type { Db } from "../db/types";
import { parseOr400, solanaAddress } from "../http/validate";
import {
  optionalAuth,
  requireAuth,
  viewerOf,
  walletOf,
} from "../middleware/auth";
import { HttpError } from "../middleware/errors";

const walletParams = z.object({ wallet: solanaAddress });

/*
 * Creator follows. PUT and DELETE /users/:wallet/follow are idempotent and Bearer-only;
 * GET /me/following lists who the viewer follows (for follow buttons); GET /users/:wallet
 * is a public profile with follower / following counts (and `isFollowing` with a Bearer).
 */
export const followsRouter = (deps: { db: Db; sessions: Sessions }) => {
  const auth = requireAuth(deps.sessions);
  const count = async (column: "follower" | "followee", wallet: string) => {
    const [row] = await deps.db
      .select({ n: sql<number>`count(*)::int` })
      .from(follows)
      .where(eq(follows[column], wallet));
    return row?.n ?? 0;
  };

  return Router()
    .put("/users/:wallet/follow", auth, async (req, res) => {
      const { wallet } = parseOr400(walletParams, req.params);
      if (wallet === walletOf(res)) {
        throw new HttpError(400, "you can't follow yourself");
      }
      await deps.db
        .insert(follows)
        .values({ follower: walletOf(res), followee: wallet })
        .onConflictDoNothing();
      res.status(204).end();
    })
    .delete("/users/:wallet/follow", auth, async (req, res) => {
      const { wallet } = parseOr400(walletParams, req.params);
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
    })
    .get("/users/:wallet", optionalAuth(deps.sessions), async (req, res) => {
      const { wallet } = parseOr400(walletParams, req.params);
      const [user] = await deps.db
        .select({
          username: users.username,
          avatarId: users.avatarId,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(eq(users.wallet, wallet));
      const viewer = viewerOf(res);
      const [followers, following, mine] = await Promise.all([
        count("followee", wallet),
        count("follower", wallet),
        viewer
          ? deps.db
              .select({ one: sql`1` })
              .from(follows)
              .where(
                and(eq(follows.follower, viewer), eq(follows.followee, wallet)),
              )
          : [],
      ]);
      res.json({
        wallet,
        username: user?.username ?? null,
        avatarId: user?.avatarId ?? null,
        avatarUrl: user?.avatarUrl ?? null,
        followers,
        following,
        ...(viewer ? { isFollowing: mine.length > 0 } : {}),
      });
    });
};
