import { describe, expect, test } from "bun:test";
import { parseEnv } from "../src/env";

const base = {
  DATABASE_URL:
    "postgresql://user:pass@ep-example.neon.tech/flicko?sslmode=require",
};

describe("parseEnv", () => {
  test("applies defaults and reads addresses from config/devnet.json", () => {
    const env = parseEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.CLUSTER).toBe("devnet");
    expect(env.RPC_URL).toBe("https://api.devnet.solana.com");
    expect(env.programId).toBe("4BfMnkmQheerNffcJtEusXxVC16uhGExrRevBLUcZgBD");
    expect(env.skrMint).toBe("2s9jDvT4hdK1ajJZ4xhAhk6aRxbTdgPdmr55mcgcSFUB");
  });

  test("env values override the network config", () => {
    const env = parseEnv({
      ...base,
      PORT: "8080",
      SKR_MINT: "So11111111111111111111111111111111111111112",
    });
    expect(env.PORT).toBe(8080);
    expect(env.skrMint).toBe("So11111111111111111111111111111111111111112");
  });

  test("treats empty strings as unset", () => {
    const env = parseEnv({ ...base, OPENAI_API_KEY: "", S3_BUCKET: "" });
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.S3_BUCKET).toBeUndefined();
  });

  test("rejects a missing or invalid DATABASE_URL", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ DATABASE_URL: "not a url" })).toThrow(
      /DATABASE_URL/,
    );
  });

  test("an unknown cluster has no SKR mint unless one is given", () => {
    expect(parseEnv({ ...base, CLUSTER: "mainnet" }).skrMint).toBeUndefined();
  });
});
