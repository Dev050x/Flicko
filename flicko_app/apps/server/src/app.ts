import cors from "cors";
import express from "express";
import helmet from "helmet";
import { errorHandler, notFound } from "./middleware/errors";
import { authRouter, type AuthDeps } from "./routes/auth";
import { feedRouter, type ReadDeps } from "./routes/feed";
import { healthRouter, type HealthDeps } from "./routes/health";
import { meRouter } from "./routes/me";
import { memesRouter } from "./routes/memes";

export interface AppDeps {
  corsOrigin: string;
  health: HealthDeps;
  auth?: AuthDeps;
  read?: ReadDeps;
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

  if (deps.read) {
    app.use(feedRouter(deps.read)).use(memesRouter(deps.read));
  }

  return app.use(notFound).use(errorHandler);
};
