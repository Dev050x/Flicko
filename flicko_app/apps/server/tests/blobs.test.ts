import { describe, expect, test } from "bun:test";
import { memoryBlobStore, s3BlobStore } from "../src/storage/blobs";

const s3Options = {
  bucket: "flicko-test",
  region: "us-east-1",
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "secret",
};

describe("memory blob store", () => {
  test("round-trips bytes and text, reports size and deletes", async () => {
    const store = memoryBlobStore();
    await store.put("raw/a.jpg", new Uint8Array([1, 2, 3]), "image/jpeg");
    await store.put("memes/a.json", '{"ok":true}', "application/json");
    expect(await store.get("raw/a.jpg")).toEqual(new Uint8Array([1, 2, 3]));
    expect(new TextDecoder().decode(await store.get("memes/a.json"))).toBe(
      '{"ok":true}',
    );
    expect(store.contentType("memes/a.json")).toBe("application/json");
    expect(await store.size("raw/a.jpg")).toBe(3);
    expect(await store.size("missing")).toBeNull();
    await store.delete("raw/a.jpg");
    expect(store.keys()).toEqual(["memes/a.json"]);
    await expect(store.get("raw/a.jpg")).rejects.toThrow();
  });
});

describe("s3 blob store", () => {
  test("public urls use the bucket host or a custom base", () => {
    expect(s3BlobStore(s3Options).publicUrl("memes/x.jpg")).toBe(
      "https://flicko-test.s3.us-east-1.amazonaws.com/memes/x.jpg",
    );
    expect(
      s3BlobStore({
        ...s3Options,
        publicBaseUrl: "https://cdn.flicko.app/",
      }).publicUrl("memes/x.jpg"),
    ).toBe("https://cdn.flicko.app/memes/x.jpg");
  });

  test("presigns a short-lived PUT for the exact key", () => {
    const url = new URL(
      s3BlobStore(s3Options).presignPut("incoming/abc", "image/jpeg", 300),
    );
    expect(url.pathname.endsWith("/incoming/abc")).toBe(true);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });
});
