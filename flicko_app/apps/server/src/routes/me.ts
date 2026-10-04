import { and, eq, ne } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { AVATAR_IDS } from "../avatars";
import type { Sessions } from "../auth/jwt";
import { users } from "../db/schema";
import type { Db } from "../db/types";
import {
  optionalAuth,
  requireAuth,
  viewerOf,
  walletOf,
} from "../middleware/auth";
import { EXPO_TOKEN } from "../notify/expo";
import { parseOr400 } from "../http/validate";
import { HttpError } from "../middleware/errors";

const pushTokenBody = z.object({
  token: z.string().trim().regex(EXPO_TOKEN, "not an expo push token"),
});

/*
 * 3-20 characters of a-z, 0-9, _ and dots (so .skr names like bobo.skr fit); dots never
 * lead, trail or repeat.
 */
const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^(?!.*\.\.)[a-z0-9_][a-z0-9_.]{1,18}[a-z0-9_]$/,
    "3-20 characters: a-z, 0-9, _ or .",
  );
/*
 * Any field may be sent alone; picking a bundled avatar replaces an uploaded photo.
 * An empty bio or display name clears it.
 */
const profileBody = z
  .object({
    username: username.optional(),
    avatarId: z.enum(AVATAR_IDS).nullable().optional(),
    displayName: z
      .string()
      .trim()
      .max(30)
      .transform((value) => value || null)
      .optional(),
    bio: z
      .string()
      .trim()
      .max(160)
      .transform((value) => value || null)
      .optional(),
  })
  .refine(
    (body) => Object.values(body).some((value) => value !== undefined),
    "nothing to update",
  );

export const meRouter = (deps: { db: Db; sessions: Sessions }) =>
  Router()
    /*
     * Live check for the profile screen: free, or already yours, counts as available.
     */
    .get("/usernames/:name", optionalAuth(deps.sessions), async (req, res) => {
      const result = username.safeParse(req.params.name);
      if (!result.success) {
        res.json({
          username: req.params.name,
          available: false,
          reason: "invalid",
        });
        return;
      }
      const [owner] = await deps.db
        .select({ wallet: users.wallet })
        .from(users)
        .where(eq(users.username, result.data));
      const available = !owner || owner.wallet === viewerOf(res);
      res.json({
        username: result.data,
        available,
        ...(available ? {} : { reason: "taken" }),
      });
    })
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
      const result = profileBody.safeParse(req.body);
      if (!result.success) {
        throw new HttpError(400, z.prettifyError(result.error));
      }
      const { username, avatarId, displayName, bio } = result.data;

      if (username !== undefined) {
        const [taken] = await deps.db
          .select({ wallet: users.wallet })
          .from(users)
          .where(eq(users.username, username));
        if (taken && taken.wallet !== walletOf(res)) {
          throw new HttpError(409, "username taken");
        }
      }

      const [user] = await deps.db
        .update(users)
        .set({
          ...(username !== undefined ? { username } : {}),
          ...(avatarId !== undefined ? { avatarId, avatarUrl: null } : {}),
          ...(displayName !== undefined ? { displayName } : {}),
          ...(bio !== undefined ? { bio } : {}),
        })
        .where(eq(users.wallet, walletOf(res)))
        .returning();
      if (!user) throw new HttpError(404, "user not found");
      res.json({ user });
    })
    .put("/me/push-token", async (req, res) => {
      const { token } = parseOr400(pushTokenBody, req.body);
      const wallet = walletOf(res);
      await deps.db
        .update(users)
        .set({ pushToken: null })
        .where(and(eq(users.pushToken, token), ne(users.wallet, wallet)));
      const [user] = await deps.db
        .update(users)
        .set({ pushToken: token })
        .where(eq(users.wallet, wallet))
        .returning({ wallet: users.wallet });
      if (!user) throw new HttpError(404, "user not found");
      res.status(204).end();
    })
    .delete("/me/push-token", async (_req, res) => {
      await deps.db
        .update(users)
        .set({ pushToken: null })
        .where(eq(users.wallet, walletOf(res)));
      res.status(204).end();
    });
