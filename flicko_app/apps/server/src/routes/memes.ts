import { Router } from "express";
import { z } from "zod";
import type { Db } from "../db/types";
import {
  nextOffset,
  pageQuery,
  parseOr400,
  solanaAddress,
} from "../http/validate";
import {
  optionalAuth,
  requireAuth,
  viewerOf,
  walletOf,
} from "../middleware/auth";
import { HttpError } from "../middleware/errors";
import { getMeme, listCandles, listTrades, memeExists } from "../queries/memes";
import {
  addReaction,
  getOverview,
  REACTIONS,
  removeReaction,
} from "../queries/overview";
import type { ReadDeps } from "./feed";

const mintParams = z.object({ mint: solanaAddress });

const candleQuery = z.object({
  interval: z.enum(["1m", "5m", "1h", "1d"]).default("1h"),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

const tradesQuery = pageQuery(100, 50);
const reactBody = z.object({ kind: z.enum(REACTIONS) });
const reactParams = mintParams.extend({ kind: z.enum(REACTIONS) });

const knownMint = async (db: Db, params: unknown) => {
  const { mint } = parseOr400(mintParams, params);
  if (!(await memeExists(db, mint))) throw new HttpError(404, "meme not found");
  return mint;
};

/*
 * `GET /memes/:mint` returns the meme plus its Overview (market stats, activity,
 * reactions and, with a Bearer token, the viewer's position). Reactions need sign-in.
 */
export const memesRouter = (deps: ReadDeps) => {
  const router = Router()
    .get("/memes/:mint", optionalAuth(deps.sessions), async (req, res) => {
      const { mint } = parseOr400(mintParams, req.params);
      const meme = await getMeme(deps.db, mint);
      if (!meme) throw new HttpError(404, "meme not found");
      const overview = await getOverview(deps.db, mint, viewerOf(res));
      res.json({ meme, overview });
    })
    .get("/memes/:mint/candles", async (req, res) => {
      const { interval, limit } = parseOr400(candleQuery, req.query);
      const mint = await knownMint(deps.db, req.params);
      res.json({
        interval,
        candles: await listCandles(deps.db, mint, interval, limit),
      });
    })
    .get("/memes/:mint/trades", async (req, res) => {
      const { limit, offset } = parseOr400(tradesQuery, req.query);
      const mint = await knownMint(deps.db, req.params);
      const items = await listTrades(deps.db, mint, limit, offset);
      res.json({ items, nextOffset: nextOffset(offset, limit, items.length) });
    });

  if (deps.sessions) {
    const auth = requireAuth(deps.sessions);
    router
      .post("/memes/:mint/react", auth, async (req, res) => {
        const mint = await knownMint(deps.db, req.params);
        const { kind } = parseOr400(reactBody, req.body ?? {});
        await addReaction(deps.db, walletOf(res), mint, kind);
        res.status(204).end();
      })
      .delete("/memes/:mint/react/:kind", auth, async (req, res) => {
        const { mint, kind } = parseOr400(reactParams, req.params);
        await removeReaction(deps.db, walletOf(res), mint, kind);
        res.status(204).end();
      });
  }
  return router;
};
