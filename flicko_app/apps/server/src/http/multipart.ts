import type { Request } from "express";
import { Readable } from "node:stream";
import { HttpError } from "../middleware/errors";

/*
 * Reads a multipart/form-data body with the runtime's own FormData parser. The size is
 * checked from Content-Length first, so oversized photos are refused before reading.
 */
export const readForm = async (req: Request, maxBytes: number) => {
  if (!req.is("multipart/form-data")) {
    throw new HttpError(415, "expected multipart/form-data");
  }
  const length = Number(req.headers["content-length"]);
  if (!Number.isFinite(length) || length <= 0) {
    throw new HttpError(411, "content-length required");
  }
  if (length > maxBytes) throw new HttpError(413, "photo is too large");
  try {
    return await new Request("http://form.local", {
      method: "POST",
      headers: { "content-type": req.headers["content-type"]! },
      body: Readable.toWeb(req) as ReadableStream,
      duplex: "half",
    } as RequestInit).formData();
  } catch {
    throw new HttpError(400, "malformed form data");
  }
};

export type Form = Awaited<ReturnType<typeof readForm>>;

/* A file field's bytes, or 400. */
export const fileField = async (form: Form, name: string) => {
  const value = form.get(name);
  if (!value || typeof value === "string") {
    throw new HttpError(400, `${name} must be a file`);
  }
  return new Uint8Array(await value.arrayBuffer());
};

/* Plain text fields as an object, for zod. */
export const textFields = (form: Form) =>
  Object.fromEntries(
    [...form.entries()].filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
