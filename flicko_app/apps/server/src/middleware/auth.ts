import type { RequestHandler, Response } from "express";
import type { Sessions } from "../auth/jwt";
import { HttpError } from "./errors";

export const requireAuth =
  (sessions: Sessions): RequestHandler =>
  async (req, res, next) => {
    const [scheme, token] = (req.headers.authorization ?? "").split(" ");
    if (scheme !== "Bearer" || !token) {
      next(new HttpError(401, "missing bearer token"));
      return;
    }
    try {
      res.locals.wallet = await sessions.verify(token);
      next();
    } catch {
      next(new HttpError(401, "invalid or expired token"));
    }
  };

export const walletOf = (res: Response) => res.locals.wallet as string;
