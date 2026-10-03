import { and, desc, eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import type { Sessions } from "../auth/jwt";
import { watchlist } from "../db/schema";
import type { Db } from "../db/types";
import { parseOr400, solanaAddress } from "../http/validate";
import { requireAuth, walletOf } from "../middleware/auth";
import { HttpError } from "../middleware/errors";
import { listMarket, WINDOWS } from "../queries/market";
import { memeExists } from "../queries/memes";

const mintParams = z.object({ mint: solanaAddress });
const listQuery = z.object({ window: z.enum(WINDOWS).default("h24") });

/*
 * The signed-in wallet's starred memes. GET returns them as Markets rows (newest star
 * first) plus the bare mint list for star buttons; POST and DELETE are idempotent.
 */
export const watchlistRouter = (deps: { db: Db; sessions: Sessions }) => {
  const auth = requireAuth(deps.sessions);
  const starred = async (wallet: string) =>
    (
      await deps.db
        .select({ mint: watchlist.mint })
        .from(watchlist)
        .where(eq(watchlist.wallet, wallet))
        .orderBy(desc(watchlist.createdAt))
    ).map((row) => row.mint);

  return Router()
    .get("/me/watchlist", auth, async (req, res) => {
      const { window } = parseOr400(listQuery, req.query);
      const mints = await starred(walletOf(res));
      const rows = await listMarket(deps.db, {
        sort: "new",
        window,
        order: "desc",
        phase: "all",
        mints,
        limit: 100,
        offset: 0,
      });
      const order = new Map(mints.map((mint, i) => [mint, i]));
      rows.sort((a, b) => order.get(a.mint)! - order.get(b.mint)!);
      res.json({ mints, items: rows });
    })
    .post("/me/watchlist/:mint", auth, async (req, res) => {
      const { mint } = parseOr400(mintParams, req.params);
      if (!(await memeExists(deps.db, mint))) throw new HttpError(404, "meme not found");
      await deps.db
        .insert(watchlist)
        .values({ wallet: walletOf(res), mint })
        .onConflictDoNothing();
      res.status(204).end();
    })
    .delete("/me/watchlist/:mint", auth, async (req, res) => {
      const { mint } = parseOr400(mintParams, req.params);
      await deps.db
        .delete(watchlist)
        .where(and(eq(watchlist.wallet, walletOf(res)), eq(watchlist.mint, mint)));
      res.status(204).end();
    });
};
