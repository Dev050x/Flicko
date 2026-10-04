import { and, desc, eq, isNull, count } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import type { Sessions } from "../auth/jwt";
import { memes, priceAlerts } from "../db/schema";
import type { Db } from "../db/types";
import { parseOr400, solanaAddress } from "../http/validate";
import { requireAuth, walletOf } from "../middleware/auth";
import { HttpError } from "../middleware/errors";

/** active alerts one wallet may keep on one meme */
export const MAX_ALERTS_PER_MEME = 10;

const createBody = z.object({
  mint: solanaAddress,
  /** SKR base units per whole token, like memes.price */
  price: z.string().regex(/^[1-9][0-9]{0,30}$/, "price must be a positive integer string"),
  direction: z.enum(["above", "below"]),
});
const listQuery = z.object({ mint: solanaAddress.optional() });
const idParams = z.object({ id: z.string().uuid() });

const view = (row: typeof priceAlerts.$inferSelect) => ({
  id: row.id,
  mint: row.mint,
  price: row.price,
  direction: row.direction,
  triggeredAt: row.triggeredAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

/*
 * Price alerts: "ping me when the price goes above/below X". The notifier fires each
 * one once, after the trade that crosses it, then marks it triggered.
 */
export const alertsRouter = (deps: { db: Db; sessions: Sessions }) => {
  const auth = requireAuth(deps.sessions);
  return Router()
    .get("/me/alerts", auth, async (req, res) => {
      const { mint } = parseOr400(listQuery, req.query);
      const rows = await deps.db
        .select()
        .from(priceAlerts)
        .where(
          and(
            eq(priceAlerts.wallet, walletOf(res)),
            mint ? eq(priceAlerts.mint, mint) : undefined,
          ),
        )
        .orderBy(desc(priceAlerts.createdAt))
        .limit(100);
      res.json({ items: rows.map(view) });
    })
    .post("/me/alerts", auth, async (req, res) => {
      const body = parseOr400(createBody, req.body ?? {});
      const wallet = walletOf(res);
      const [meme] = await deps.db
        .select({ mint: memes.mint })
        .from(memes)
        .where(eq(memes.mint, body.mint));
      if (!meme) throw new HttpError(404, "meme not found");
      const [active] = await deps.db
        .select({ n: count() })
        .from(priceAlerts)
        .where(
          and(
            eq(priceAlerts.wallet, wallet),
            eq(priceAlerts.mint, body.mint),
            isNull(priceAlerts.triggeredAt),
          ),
        );
      if ((active?.n ?? 0) >= MAX_ALERTS_PER_MEME) {
        throw new HttpError(409, `at most ${MAX_ALERTS_PER_MEME} active alerts per meme`);
      }
      const [row] = await deps.db
        .insert(priceAlerts)
        .values({ wallet, mint: body.mint, price: body.price, direction: body.direction })
        .returning();
      res.status(201).json({ alert: view(row!) });
    })
    .delete("/me/alerts/:id", auth, async (req, res) => {
      const { id } = parseOr400(idParams, req.params);
      await deps.db
        .delete(priceAlerts)
        .where(and(eq(priceAlerts.id, id), eq(priceAlerts.wallet, walletOf(res))));
      res.status(204).end();
    });
};
