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
import {
  getMeme,
  largeTradeSkr,
  listCandles,
  listTrades,
  memeExists,
} from "../queries/memes";
import {
  CHART_TFS,
  chartCandles,
  listHolders,
  soldOverTime,
  usernamesFor,
} from "../queries/chart";
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
  /** chart timeframe: aggregated and gap-filled (see chartCandles) */
  tf: z.enum(CHART_TFS).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
const holdersQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const tradesQuery = pageQuery(100, 50).extend({
  side: z.enum(["buy", "sell"]).optional(),
  trader: solanaAddress.optional(),
});
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
      const { interval, tf, limit } = parseOr400(candleQuery, req.query);
      const mint = await knownMint(deps.db, req.params);
      if (tf) {
        res.json({ tf, candles: await chartCandles(deps.db, mint, tf, limit) });
        return;
      }
      res.json({
        interval,
        candles: await listCandles(deps.db, mint, interval, limit),
      });
    })
    .get("/memes/:mint/trades", async (req, res) => {
      const { limit, offset, side, trader } = parseOr400(tradesQuery, req.query);
      const mint = await knownMint(deps.db, req.params);
      const [rows, largeSkr] = await Promise.all([
        listTrades(deps.db, mint, limit, offset, { side, trader }),
        largeTradeSkr(deps.db, mint),
      ]);
      const names = await usernamesFor(
        deps.db,
        rows.map((row) => row.trader),
      );
      const items = rows.map((row) => ({
        ...row,
        traderUsername: names.get(row.trader) ?? null,
      }));
      res.json({
        items,
        largeSkr,
        nextOffset: nextOffset(offset, limit, items.length),
      });
    })
    .get("/memes/:mint/sold", async (req, res) => {
      const mint = await knownMint(deps.db, req.params);
      res.json({ points: await soldOverTime(deps.db, mint) });
    })
    .get("/memes/:mint/holders", async (req, res) => {
      const { limit } = parseOr400(holdersQuery, req.query);
      const mint = await knownMint(deps.db, req.params);
      res.json(await listHolders(deps.db, mint, limit));
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
