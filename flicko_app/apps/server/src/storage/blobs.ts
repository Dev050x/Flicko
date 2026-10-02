import { S3Client } from "bun";

export interface BlobStore {
  put(
    key: string,
    body: Uint8Array | string,
    contentType: string,
  ): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  size(key: string): Promise<number | null>;
  delete(key: string): Promise<void>;
  presignPut(key: string, contentType: string, expiresIn: number): string;
  publicUrl(key: string): string;
}

export interface S3Options {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string;
}

export const s3BlobStore = (opts: S3Options): BlobStore => {
  const client = new S3Client({
    bucket: opts.bucket,
    region: opts.region,
    accessKeyId: opts.accessKeyId,
    secretAccessKey: opts.secretAccessKey,
  });
  const base =
    opts.publicBaseUrl ??
    `https://${opts.bucket}.s3.${opts.region}.amazonaws.com`;
  return {
    put: async (key, body, contentType) => {
      await client.write(key, body, { type: contentType });
    },
    get: async (key) => new Uint8Array(await client.file(key).arrayBuffer()),
    size: async (key) => {
      const file = client.file(key);
      if (!(await file.exists())) return null;
      return (await file.stat()).size;
    },
    delete: async (key) => {
      await client.file(key).delete();
    },
    presignPut: (key, contentType, expiresIn) =>
      client.file(key).presign({ method: "PUT", expiresIn, type: contentType }),
    publicUrl: (key) => `${base.replace(/\/$/, "")}/${key}`,
  };
};

export const memoryBlobStore = (publicBaseUrl = "https://blobs.test") => {
  const blobs = new Map<string, { body: Uint8Array; contentType: string }>();
  const store: BlobStore & {
    keys(): string[];
    contentType(key: string): string | undefined;
  } = {
    put: async (key, body, contentType) => {
      blobs.set(key, {
        body: typeof body === "string" ? new TextEncoder().encode(body) : body,
        contentType,
      });
    },
    get: async (key) => {
      const blob = blobs.get(key);
      if (!blob) throw new Error(`no blob at ${key}`);
      return blob.body;
    },
    size: async (key) => blobs.get(key)?.body.length ?? null,
    delete: async (key) => {
      blobs.delete(key);
    },
    presignPut: (key, contentType, expiresIn) =>
      `${publicBaseUrl}/${key}?method=PUT&type=${encodeURIComponent(contentType)}&expires=${expiresIn}`,
    publicUrl: (key) => `${publicBaseUrl}/${key}`,
    keys: () => [...blobs.keys()],
    contentType: (key) => blobs.get(key)?.contentType,
  };
  return store;
};
