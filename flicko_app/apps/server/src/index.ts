import "./net";
import { createApp } from "./app";
import { createSessions } from "./auth/jwt";
import { upstashNonceStore } from "./auth/nonces";
import { createDb } from "./db/client";
import { parseEnv } from "./env";
import { connectionSource } from "./indexer/chain";
import { createEventDecoder } from "./indexer/events";
import { createIndexer } from "./indexer/indexer";
import { PublicKey } from "@solana/web3.js";

const env = parseEnv(process.env);
const database = createDb(env.DATABASE_URL);

const required = (name: string, value: string | undefined) => {
  if (!value) throw new Error(`${name} is required`);
  return value;
};

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
    sessions: createSessions(required("JWT_SECRET", env.JWT_SECRET)),
    policy: {
      domain: env.SIWS_DOMAIN,
      uri: env.SIWS_URI,
      chainId: `solana:${env.CLUSTER}`,
      statement: "Sign in to Flicko",
      ttlSeconds: 300,
    },
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
