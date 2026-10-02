import { eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import type { Sessions } from "../auth/jwt";
import { users } from "../db/schema";
import type { Db } from "../db/types";
import { requireAuth, walletOf } from "../middleware/auth";
import { HttpError } from "../middleware/errors";

const usernameBody = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,20}$/, "3-20 characters: a-z, 0-9 or _"),
});

export const meRouter = (deps: { db: Db; sessions: Sessions }) =>
  Router()
    .use("/me", requireAuth(deps.sessions))
    .get("/me", async (_req, res) => {
      const [user] = await deps.db
        .select()
        .from(users)
        .where(eq(users.wallet, walletOf(res)));
      if (!user) throw new HttpError(404, "user not found");
      res.json({ user });
    })
    .patch("/me", async (req, res) => {
      const result = usernameBody.safeParse(req.body);
      if (!result.success) {
        throw new HttpError(400, z.prettifyError(result.error));
      }
      const { username } = result.data;

      const [taken] = await deps.db
        .select({ wallet: users.wallet })
        .from(users)
        .where(eq(users.username, username));
      if (taken && taken.wallet !== walletOf(res)) {
        throw new HttpError(409, "username taken");
      }

      const [user] = await deps.db
        .update(users)
        .set({ username })
        .where(eq(users.wallet, walletOf(res)))
        .returning();
      if (!user) throw new HttpError(404, "user not found");
      res.json({ user });
    });
