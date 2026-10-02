import { PROGRAM_ID } from "@flicko/sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((value) => (value === "" ? undefined : value));

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().default("*"),
  DATABASE_URL: z.url(),
  CLUSTER: z.string().default("devnet"),
  RPC_URL: z.url().default("https://api.devnet.solana.com"),
  WS_URL: optional,
  INDEXER_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  PROGRAM_ID: optional,
  SKR_MINT: optional,
  JWT_SECRET: optional,
  SIWS_DOMAIN: z.string().default("flicko.app"),
  SIWS_URI: z.url().default("https://flicko.app"),
  UPSTASH_REDIS_REST_URL: optional,
  UPSTASH_REDIS_REST_TOKEN: optional,
  AWS_REGION: optional,
  AWS_ACCESS_KEY_ID: optional,
  AWS_SECRET_ACCESS_KEY: optional,
  S3_BUCKET: optional,
  S3_PUBLIC_BASE_URL: optional,
  AI_PROVIDER: z.enum(["openai", "deepseek"]).default("openai"),
  OPENAI_API_KEY: optional,
  OPENAI_MODEL: z.string().default("gpt-5-mini"),
  DEEPSEEK_API_KEY: optional,
  DEEPSEEK_MODEL: z.string().default("deepseek-flash"),
  NOTIFY_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  EXPO_ACCESS_TOKEN: optional,
  ATTESTOR_SECRET_KEY: optional,
});

export type Env = z.infer<typeof schema> & {
  programId: string;
  skrMint: string | undefined;
};

const networkConfig = (cluster: string) => {
  try {
    return JSON.parse(
      readFileSync(
        join(import.meta.dir, `../../../config/${cluster}.json`),
        "utf8",
      ),
    ) as { programId?: string; skrMint?: string };
  } catch {
    return {};
  }
};

export const parseEnv = (source: Record<string, string | undefined>): Env => {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new Error(`invalid environment:\n${z.prettifyError(result.error)}`);
  }
  const network = networkConfig(result.data.CLUSTER);
  return {
    ...result.data,
    programId:
      result.data.PROGRAM_ID ?? network.programId ?? PROGRAM_ID.toBase58(),
    skrMint: result.data.SKR_MINT ?? network.skrMint,
  };
};
