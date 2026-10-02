import { Router } from "express";
import type { Sessions } from "../auth/jwt";
import type { Db } from "../db/types";
import { requireAuth, walletOf } from "../middleware/auth";
import { getCreatorEarnings, getPortfolio } from "../queries/portfolio";

export const portfolioRouter = (deps: { db: Db; sessions: Sessions }) => {
  const auth = requireAuth(deps.sessions);
  return Router()
    .get("/me/portfolio", auth, async (_req, res) => {
      res.json(await getPortfolio(deps.db, walletOf(res)));
    })
    .get("/me/created", auth, async (_req, res) => {
      res.json(await getCreatorEarnings(deps.db, walletOf(res)));
    });
};
