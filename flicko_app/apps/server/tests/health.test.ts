import { afterAll, describe, expect, test } from "bun:test";
import type { Server } from "node:http";
import { createApp } from "../src/app";

/*
 * Starts the app on a random port with an injected database ping, so no Postgres is needed.
 */
const servers: Server[] = [];
const start = (ping: () => Promise<void>) =>
  new Promise<string>((resolve) => {
    const server = createApp({
      corsOrigin: "*",
      health: { ping, cluster: "devnet", programId: "prog", skrMint: "skr" },
    }).listen(0, () => {
      const address = server.address();
      resolve(
        `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`,
      );
    });
    servers.push(server);
  });

afterAll(() => {
  for (const server of servers) server.close();
});

describe("GET /health", () => {
  test("reports ok when the database answers", async () => {
    const url = await start(async () => {});
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      db: "up",
      cluster: "devnet",
      programId: "prog",
      skrMint: "skr",
    });
  });

  test("returns 503 when the database is down", async () => {
    const url = await start(async () => {
      throw new Error("connection refused");
    });
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { db: string }).db).toBe("down");
  });

  test("unknown routes return a json 404", async () => {
    const url = await start(async () => {});
    const res = await fetch(`${url}/nope`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });

  test("sets security headers and hides express", async () => {
    const url = await start(async () => {});
    const res = await fetch(`${url}/health`);
    expect(res.headers.get("x-powered-by")).toBeNull();
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
