import { createApp } from "./app";
import { createSessions } from "./auth/jwt";
import { upstashNonceStore } from "./auth/nonces";
import { createDb } from "./db/client";
import { parseEnv } from "./env";

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

const shutdown = () => {
  server.close();
  void database.close();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
