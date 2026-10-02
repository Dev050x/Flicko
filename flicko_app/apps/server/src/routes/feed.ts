import { Router } from "express";
import { z } from "zod";
import type { Db } from "../db/types";
import { nextOffset, pageQuery, parseOr400 } from "../http/validate";
import { listFeed } from "../queries/memes";

export interface ReadDeps {
  db: Db;
}

const feedQuery = pageQuery(50, 20).extend({
  tab: z.enum(["new", "trending", "gainers"]).default("new"),
});

export const feedRouter = (deps: ReadDeps) =>
  Router().get("/feed", async (req, res) => {
    const { tab, limit, offset } = parseOr400(feedQuery, req.query);
    const items = await listFeed(deps.db, tab, limit, offset);
    res.json({
      tab,
      items,
      nextOffset: nextOffset(offset, limit, items.length),
    });
  });
