import cors from "cors";
import express from "express";
import helmet from "helmet";
import { errorHandler, notFound } from "./middleware/errors";
import { healthRouter, type HealthDeps } from "./routes/health";

export interface AppDeps {
  corsOrigin: string;
  health: HealthDeps;
}

export const createApp = (deps: AppDeps) =>
  express()
    .disable("x-powered-by")
    .use(helmet())
    .use(cors({ origin: deps.corsOrigin }))
    .use(express.json({ limit: "1mb" }))
    .use(healthRouter(deps.health))
    .use(notFound)
    .use(errorHandler);
