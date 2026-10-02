import { PublicKey } from "@solana/web3.js";
import { Router } from "express";
import { z } from "zod";
import type { Sessions } from "../auth/jwt";
import type { NonceStore } from "../auth/nonces";
import {
  createSignInInput,
  SiwsError,
  verifySignIn,
  type SiwsPolicy,
} from "../auth/siws";
import { users } from "../db/schema";
import type { Db } from "../db/types";
import { HttpError } from "../middleware/errors";

export interface AuthDeps {
  db: Db;
  nonces: NonceStore;
  sessions: Sessions;
  policy: SiwsPolicy;
}

const address = z.string().refine((value) => {
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
}, "not a solana address");

const base64 = z
  .string()
  .min(1)
  .transform((value) => Uint8Array.from(Buffer.from(value, "base64")));

const nonceBody = z.object({ address });
const signInBody = z.object({ address, message: base64, signature: base64 });

const parse = <T>(schema: z.ZodType<T>, body: unknown) => {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, z.prettifyError(result.error));
  return result.data;
};

export const authRouter = (deps: AuthDeps) =>
  Router()
    .post("/auth/nonce", async (req, res) => {
      const { address } = parse(nonceBody, req.body);
      const input = createSignInInput(deps.policy, address);
      await deps.nonces.put(input.nonce, address, deps.policy.ttlSeconds);
      res.json({ input });
    })
    .post("/auth/siws", async (req, res) => {
      const body = parse(signInBody, req.body);
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

      const [user] = await deps.db
        .insert(users)
        .values({ wallet: body.address })
        .onConflictDoUpdate({
          target: users.wallet,
          set: { wallet: body.address },
        })
        .returning();
      res.json({ ...(await deps.sessions.issue(body.address)), user });
    });
