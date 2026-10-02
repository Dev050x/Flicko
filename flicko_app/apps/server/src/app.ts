import cors from "cors";
import express from "express";
import helmet from "helmet";
import { errorHandler, notFound } from "./middleware/errors";
import { authRouter, type AuthDeps } from "./routes/auth";
import { healthRouter, type HealthDeps } from "./routes/health";
import { meRouter } from "./routes/me";

export interface AppDeps {
  corsOrigin: string;
  health: HealthDeps;
  auth?: AuthDeps;
}

export const createApp = (deps: AppDeps) => {
  const app = express()
    .disable("x-powered-by")
    .use(helmet())
    .use(cors({ origin: deps.corsOrigin }))
    .use(express.json({ limit: "1mb" }))
    .use(healthRouter(deps.health));

  if (deps.auth) {
    app.use(authRouter(deps.auth)).use(meRouter(deps.auth));
  }

  return app.use(notFound).use(errorHandler);
};
