import { PGlite } from "@electric-sql/pglite";
import { ed25519 } from "@noble/curves/ed25519.js";
import { Keypair } from "@solana/web3.js";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Server } from "node:http";
import { join } from "node:path";
import * as schema from "../src/db/schema";

/*
 * Shared helpers: an in-memory Postgres with the real migrations, a test wallet that signs
 * like a Solana wallet, and a way to serve an Express app on a random port.
 */
export const migratedDb = async () => {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: join(import.meta.dir, "../drizzle") });
  return db;
};

export const testWallet = () => {
  const keypair = Keypair.generate();
  return {
    address: keypair.publicKey.toBase58(),
    sign: (message: Uint8Array) =>
      ed25519.sign(message, keypair.secretKey.slice(0, 32)),
  };
};

export const serve = (app: {
  listen: (port: number, cb: () => void) => Server;
}) =>
  new Promise<{ url: string; close: () => void }>((resolve) => {
    const server = app.listen(0, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
