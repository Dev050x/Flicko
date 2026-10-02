import { PublicKey } from "@solana/web3.js";
import { z } from "zod";
import { HttpError } from "../middleware/errors";

export const solanaAddress = z.string().refine((value) => {
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
}, "not a solana address");

export const parseOr400 = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, z.prettifyError(result.error));
  return result.data;
};

export const pageQuery = (maxLimit: number, defaultLimit: number) =>
  z.object({
    limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
    offset: z.coerce.number().int().min(0).default(0),
  });

export const nextOffset = (offset: number, limit: number, count: number) =>
  count === limit ? offset + limit : null;
