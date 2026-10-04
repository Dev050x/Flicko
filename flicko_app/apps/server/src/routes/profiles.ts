import { Router } from "express";
import { z } from "zod";
import type { Sessions } from "../auth/jwt";
import type { Db } from "../db/types";
import { nextOffset, pageQuery, parseOr400 } from "../http/validate";
import {
  optionalAuth,
  requireAuth,
  viewerOf,
  walletOf,
} from "../middleware/auth";
import {
  claimableFees,
  getProfile,
  getPublicHoldings,
  listActivity,
  listCreatedBy,
  resolveWallet,
} from "../queries/profiles";

const idParams = z.object({ id: z.string().trim().min(1).max(64) });
const page = pageQuery(50, 30);

/*
 * Profiles. Public (optional Bearer adds `isFollowing`): GET /users/:id (wallet or
 * username) with counts and creator stats, /users/:id/memes, /users/:id/holdings (top 20,
 * no amounts). Bearer-only: GET /me/activity and GET /me/claimable (memes with fees to claim).
 */
export const profilesRouter = (deps: { db: Db; sessions: Sessions }) => {
  const auth = requireAuth(deps.sessions);
  const target = async (params: unknown) =>
    resolveWallet(deps.db, parseOr400(idParams, params).id);

  return Router()
    .get("/users/:id", optionalAuth(deps.sessions), async (req, res) => {
      res.json(
        await getProfile(deps.db, await target(req.params), viewerOf(res)),
      );
    })
    .get("/users/:id/memes", async (req, res) => {
      const { limit, offset } = parseOr400(page, req.query);
      const items = await listCreatedBy(
        deps.db,
        await target(req.params),
        limit,
        offset,
      );
      res.json({ items, nextOffset: nextOffset(offset, limit, items.length) });
    })
    .get("/users/:id/holdings", async (req, res) => {
      const items = await getPublicHoldings(deps.db, await target(req.params));
      res.json({ items });
    })
    .get("/me/activity", auth, async (req, res) => {
      const { limit, offset } = parseOr400(page, req.query);
      const items = await listActivity(deps.db, walletOf(res), limit, offset);
      res.json({ items, nextOffset: nextOffset(offset, limit, items.length) });
    })
    .get("/me/claimable", auth, async (_req, res) => {
      res.json({ items: await claimableFees(deps.db, walletOf(res)) });
    });
};
