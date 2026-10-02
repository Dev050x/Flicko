import "./net";
import { createApp } from "./app";
import { createSessions } from "./auth/jwt";
import { upstashNonceStore } from "./auth/nonces";
import { openAiCaptions } from "./ai/captions";
import { createDb } from "./db/client";
import { parseEnv } from "./env";
import { connectionSource } from "./indexer/chain";
import { createEventDecoder } from "./indexer/events";
import { createIndexer } from "./indexer/indexer";
import { s3BlobStore } from "./storage/blobs";
import { PublicKey } from "@solana/web3.js";

const env = parseEnv(process.env);
const database = createDb(env.DATABASE_URL);

const required = (name: string, value: string | undefined) => {
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const sessions = createSessions(required("JWT_SECRET", env.JWT_SECRET));

const app = createApp({
  corsOrigin: env.CORS_ORIGIN,
  health: {
    ping: database.ping,
    cluster: env.CLUSTER,
    programId: env.programId,
    skrMint: env.skrMint,
  },
  auth: {
    db: database.db,
    nonces: upstashNonceStore(
      required("UPSTASH_REDIS_REST_URL", env.UPSTASH_REDIS_REST_URL),
      required("UPSTASH_REDIS_REST_TOKEN", env.UPSTASH_REDIS_REST_TOKEN),
    ),
    sessions,
    policy: {
      domain: env.SIWS_DOMAIN,
      uri: env.SIWS_URI,
      chainId: `solana:${env.CLUSTER}`,
      statement: "Sign in to Flicko",
      ttlSeconds: 300,
    },
  },
  read: { db: database.db },
  uploads: {
    db: database.db,
    sessions,
    blobs: s3BlobStore({
      bucket: required("S3_BUCKET", env.S3_BUCKET),
      region: required("AWS_REGION", env.AWS_REGION),
      accessKeyId: required("AWS_ACCESS_KEY_ID", env.AWS_ACCESS_KEY_ID),
      secretAccessKey: required(
        "AWS_SECRET_ACCESS_KEY",
        env.AWS_SECRET_ACCESS_KEY,
      ),
      publicBaseUrl: env.S3_PUBLIC_BASE_URL,
    }),
    ai: openAiCaptions({
      apiKey: required("OPENAI_API_KEY", env.OPENAI_API_KEY),
      model: env.OPENAI_MODEL,
    }),
  },
});

const server = app.listen(env.PORT, () => {
  console.log(`flicko server on :${env.PORT} (${env.CLUSTER})`);
});

const programId = new PublicKey(env.programId);
const indexer = env.INDEXER_ENABLED
  ? createIndexer({
      db: database.db,
      chain: connectionSource(env.RPC_URL, env.WS_URL, programId),
      decode: createEventDecoder(programId),
      log: (message) => console.log(`[indexer] ${message}`),
    })
  : null;

indexer?.start().catch((err) => {
  console.error("[indexer] failed to start", err);
});

const shutdown = async () => {
  server.close();
  await indexer?.stop();
  await database.close();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
