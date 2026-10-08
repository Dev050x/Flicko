import cors from "cors";
import express from "express";
import helmet from "helmet";
import { errorHandler, notFound } from "./middleware/errors";
import { alertsRouter } from "./routes/alerts";
import { authRouter, type AuthDeps } from "./routes/auth";
import { avatarRouter } from "./routes/avatar";
import { createRouter, type CreateDeps } from "./routes/create";
import { feedRouter, type ReadDeps } from "./routes/feed";
import { filtersRouter, type FilterDeps } from "./routes/filters";
import { healthRouter, type HealthDeps } from "./routes/health";
import { meRouter } from "./routes/me";
import { marketRouter } from "./routes/market";
import { memesRouter } from "./routes/memes";
import { portfolioRouter } from "./routes/portfolio";
import { uploadsRouter, type UploadDeps } from "./routes/uploads";
import { followsRouter } from "./routes/follows";
import { likesRouter } from "./routes/likes";
import { profilesRouter } from "./routes/profiles";
import { watchlistRouter } from "./routes/watchlist";

export interface AppDeps {
  corsOrigin: string;
  health: HealthDeps;
  auth?: AuthDeps;
  read?: ReadDeps;
  uploads?: UploadDeps;
  filters?: FilterDeps;
  create?: CreateDeps;
}

export const createApp = (deps: AppDeps) => {
  const app = express()
    .disable("x-powered-by")
    .use(helmet())
    .use(cors({ origin: deps.corsOrigin }))
    .use(express.json({ limit: "1mb" }))
    .use(healthRouter(deps.health));

  if (deps.auth) {
    app
      .use(authRouter(deps.auth))
      .use(meRouter(deps.auth))
      .use(portfolioRouter(deps.auth))
      .use(followsRouter(deps.auth))
      .use(likesRouter(deps.auth))
      .use(profilesRouter(deps.auth))
      .use(watchlistRouter(deps.auth))
      .use(alertsRouter(deps.auth));
  }

  if (deps.uploads) {
    app.use(uploadsRouter(deps.uploads)).use(avatarRouter(deps.uploads));
  }

  if (deps.create) {
    app.use(createRouter(deps.create));
  }

  if (deps.filters) {
    app.use(filtersRouter(deps.filters));
  }

  if (deps.read) {
    app
      .use(feedRouter(deps.read))
      .use(marketRouter(deps.read))
      .use(memesRouter(deps.read));
  }

  return app.use(notFound).use(errorHandler);
};
