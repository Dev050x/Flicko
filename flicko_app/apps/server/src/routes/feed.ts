import { Router } from "express";
import { z } from "zod";
import type { Sessions } from "../auth/jwt";
import type { Db } from "../db/types";
import { optionalAuth, viewerOf } from "../middleware/auth";
import { HttpError } from "../middleware/errors";
import { nextOffset, pageQuery, parseOr400 } from "../http/validate";
import { listFeed } from "../queries/memes";

export interface ReadDeps {
  db: Db;
  sessions?: Sessions;
}

const feedQuery = pageQuery(50, 20).extend({
  tab: z.enum(["new", "trending", "gainers", "following"]).default("new"),
});

export const feedRouter = (deps: ReadDeps) =>
  Router().get("/feed", optionalAuth(deps.sessions), async (req, res) => {
    const { tab, limit, offset } = parseOr400(feedQuery, req.query);
    const viewer = viewerOf(res);
    if (tab === "following" && !viewer) {
      throw new HttpError(401, "sign in to see creators you follow");
    }
    const items = await listFeed(deps.db, tab, limit, offset, viewer);
    res.json({
      tab,
      items,
      nextOffset: nextOffset(offset, limit, items.length),
    });
  });
