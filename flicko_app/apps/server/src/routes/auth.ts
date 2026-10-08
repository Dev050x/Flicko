import { getTableColumns, sql } from "drizzle-orm";
import { Router } from "express";
import { grantWelcomeSkr, type WelcomeAirdrop } from "../airdrop/welcome";
import { randomAvatarId } from "../avatars";
import { z } from "zod";
import type { Sessions } from "../auth/jwt";
import type { NonceStore } from "../auth/nonces";
import {
  ANY_WALLET,
  createSignInInput,
  SiwsError,
  verifySignIn,
  type SiwsPolicy,
} from "../auth/siws";
import { users } from "../db/schema";
import type { Db } from "../db/types";
import { parseOr400, solanaAddress } from "../http/validate";
import { HttpError } from "../middleware/errors";

export interface AuthDeps {
  db: Db;
  nonces: NonceStore;
  sessions: Sessions;
  policy: SiwsPolicy;
  /** welcome SKR for new wallets (devnet faucet); off when absent */
  airdrop?: WelcomeAirdrop;
}

const base64 = z
  .string()
  .min(1)
  .transform((value) => Uint8Array.from(Buffer.from(value, "base64")));

const nonceBody = z.object({ address: solanaAddress.optional() });
const signInBody = z.object({
  address: solanaAddress,
  message: base64,
  signature: base64,
});

export const authRouter = (deps: AuthDeps) =>
  Router()
    .post("/auth/nonce", async (req, res) => {
      const { address } = parseOr400(nonceBody, req.body ?? {});
      const input = createSignInInput(deps.policy, address);
      await deps.nonces.put(
        input.nonce,
        address ?? ANY_WALLET,
        deps.policy.ttlSeconds,
      );
      res.json({ input });
    })
    .post("/auth/siws", async (req, res) => {
      const body = parseOr400(signInBody, req.body);
      try {
        await verifySignIn({
          ...body,
          policy: deps.policy,
          takeNonce: deps.nonces.take,
        });
      } catch (err) {
        if (err instanceof SiwsError) throw new HttpError(401, err.message);
        throw err;
      }

      // xmax = 0 only on a freshly inserted row: this sign-in created the user.
      const [row] = await deps.db
        .insert(users)
        .values({ wallet: body.address, avatarId: randomAvatarId() })
        .onConflictDoUpdate({
          target: users.wallet,
          set: { wallet: body.address },
        })
        .returning({
          ...getTableColumns(users),
          isNew: sql<boolean>`(xmax = 0)`,
        });
      if (!row) throw new Error("user upsert returned nothing");
      const { isNew, ...user } = row;
      const welcome = isNew && deps.airdrop ? deps.airdrop : undefined;
      if (deps.airdrop) {
        // In the background: the SKR arrives a few seconds after sign-in.
        void grantWelcomeSkr(deps.db, deps.airdrop, body.address, isNew);
      }
      res.json({
        ...(await deps.sessions.issue(body.address)),
        user,
        ...(welcome ? { welcomeSkr: welcome.amount.toString() } : {}),
      });
    });
