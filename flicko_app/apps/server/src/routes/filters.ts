import { eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import type { Sessions } from "../auth/jwt";
import { filterUnlocks } from "../db/schema";
import type { Db } from "../db/types";
import type { BurnVerifier } from "../filters/burns";
import { premiumPrice } from "../filters/catalog";
import { parseOr400 } from "../http/validate";
import { requireAuth, walletOf } from "../middleware/auth";
import { HttpError } from "../middleware/errors";

export interface FilterDeps {
  db: Db;
  sessions: Sessions;
  burns: BurnVerifier;
  skrMint: string;
  skrDecimals: number;
}

const unlockBody = z.object({
  filterId: z.string().trim().min(1).max(64),
  signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/, "bad signature"),
});

/*
 * Premium filters: the app burns the filter's price in SKR, then posts the signature
 * here; we check the burn on-chain and remember the unlock for the wallet.
 */
export const filtersRouter = (deps: FilterDeps) =>
  Router()
    .get("/me/filters", requireAuth(deps.sessions), async (_req, res) => {
      const rows = await deps.db
        .select({ filterId: filterUnlocks.filterId })
        .from(filterUnlocks)
        .where(eq(filterUnlocks.wallet, walletOf(res)));
      res.json({ filterIds: rows.map((row) => row.filterId) });
    })
    .post("/filters/unlock", requireAuth(deps.sessions), async (req, res) => {
      const { filterId, signature } = parseOr400(unlockBody, req.body);
      const wallet = walletOf(res);
      const price = premiumPrice(filterId);
      if (price === undefined) throw new HttpError(404, "not a premium filter");

      const owned = await deps.db
        .select({ filterId: filterUnlocks.filterId })
        .from(filterUnlocks)
        .where(eq(filterUnlocks.wallet, wallet));
      if (owned.some((row) => row.filterId === filterId)) {
        res.json({ filterId, unlocked: true });
        return;
      }

      const [used] = await deps.db
        .select({ wallet: filterUnlocks.wallet })
        .from(filterUnlocks)
        .where(eq(filterUnlocks.signature, signature));
      if (used) throw new HttpError(409, "signature already used");

      const burned = await deps.burns.burnedBy(signature, wallet, deps.skrMint);
      if (burned === null) {
        throw new HttpError(422, "transaction not found or failed");
      }
      const needed = BigInt(price) * 10n ** BigInt(deps.skrDecimals);
      if (burned < needed) {
        throw new HttpError(422, `no burn of ${price} SKR from this wallet`);
      }

      const inserted = await deps.db
        .insert(filterUnlocks)
        .values({ wallet, filterId, signature, burned: burned.toString() })
        .onConflictDoNothing()
        .returning({ filterId: filterUnlocks.filterId });
      if (inserted.length === 0) {
        throw new HttpError(409, "signature already used");
      }
      res.status(201).json({ filterId, unlocked: true });
    });
