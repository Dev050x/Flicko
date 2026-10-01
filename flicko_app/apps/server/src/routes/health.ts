import { Router } from "express";

export interface HealthDeps {
  ping: () => Promise<void>;
  cluster: string;
  programId: string;
  skrMint: string | undefined;
}

export const healthRouter = (deps: HealthDeps) =>
  Router().get("/health", async (_req, res) => {
    const db = await deps
      .ping()
      .then(() => "up" as const)
      .catch(() => "down" as const);
    res.status(db === "up" ? 200 : 503).json({
      ok: db === "up",
      db,
      cluster: deps.cluster,
      programId: deps.programId,
      skrMint: deps.skrMint ?? null,
    });
  });
