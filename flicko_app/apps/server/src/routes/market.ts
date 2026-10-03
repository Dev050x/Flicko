import { Router } from "express";
import { z } from "zod";
import { nextOffset, pageQuery, parseOr400 } from "../http/validate";
import { optionalAuth, viewerOf } from "../middleware/auth";
import {
  countPumping,
  listMarket,
  listReels,
  MARKET_SORTS,
  WINDOWS,
} from "../queries/market";
import type { ReadDeps } from "./feed";

const marketQuery = pageQuery(100, 50).extend({
  sort: z.enum(MARKET_SORTS).default("trending"),
  window: z.enum(WINDOWS).default("h24"),
  order: z.enum(["asc", "desc"]).default("desc"),
  phase: z.enum(["all", "launch", "graduated"]).default("all"),
  q: z.string().trim().min(1).max(64).optional(),
});

const reelsQuery = pageQuery(20, 10);

export const marketRouter = (deps: ReadDeps) =>
  Router()
    .get("/market", async (req, res) => {
      const query = parseOr400(marketQuery, req.query);
      const items = await listMarket(deps.db, query);
      res.json({
        sort: query.sort,
        window: query.window,
        order: query.order,
        items,
        nextOffset: nextOffset(query.offset, query.limit, items.length),
      });
    })
    .get("/market/pumping-count", async (_req, res) => {
      res.json({ count: await countPumping(deps.db) });
    })
    .get("/reels", optionalAuth(deps.sessions), async (req, res) => {
      const { limit, offset } = parseOr400(reelsQuery, req.query);
      const items = await listReels(deps.db, limit, offset, viewerOf(res));
      res.json({ items, nextOffset: nextOffset(offset, limit, items.length) });
    });
