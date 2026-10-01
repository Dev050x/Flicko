import { createApp } from "./app";
import { createDb } from "./db/client";
import { parseEnv } from "./env";

const env = parseEnv(process.env);
const database = createDb(env.DATABASE_URL);

const app = createApp({
  corsOrigin: env.CORS_ORIGIN,
  health: {
    ping: database.ping,
    cluster: env.CLUSTER,
    programId: env.programId,
    skrMint: env.skrMint,
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
