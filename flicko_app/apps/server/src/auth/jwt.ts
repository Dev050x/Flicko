import { jwtVerify, SignJWT } from "jose";

const SESSION_SECONDS = 7 * 24 * 60 * 60;

export const createSessions = (secret: string) => {
  const key = new TextEncoder().encode(secret);
  return {
    issue: async (wallet: string) => {
      const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(wallet)
        .setIssuedAt()
        .setExpirationTime(expiresAt)
        .sign(key);
      return { token, expiresAt: new Date(expiresAt * 1000).toISOString() };
    },
    verify: async (token: string) => {
      const { payload } = await jwtVerify(token, key, {
        algorithms: ["HS256"],
      });
      if (!payload.sub) throw new Error("token without subject");
      return payload.sub;
    },
  };
};

export type Sessions = ReturnType<typeof createSessions>;
