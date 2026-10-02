import { describe, expect, test } from "bun:test";
import { memoryBlobStore, s3BlobStore } from "../src/storage/blobs";

describe("blob stores", () => {
  test("memory store round-trips bytes and text", async () => {
    const store = memoryBlobStore();
    await store.put("raw/a.jpg", new Uint8Array([1, 2, 3]), "image/jpeg");
    await store.put("memes/a.json", '{"ok":true}', "application/json");
    expect(await store.get("raw/a.jpg")).toEqual(new Uint8Array([1, 2, 3]));
    expect(new TextDecoder().decode(await store.get("memes/a.json"))).toBe(
      '{"ok":true}',
    );
    expect(store.contentType("memes/a.json")).toBe("application/json");
    expect(store.keys().sort()).toEqual(["memes/a.json", "raw/a.jpg"]);
    await expect(store.get("missing")).rejects.toThrow();
  });

  test("s3 public urls use the bucket host or a custom base", () => {
    const opts = {
      bucket: "flicko-test",
      region: "ap-south-1",
      accessKeyId: "id",
      secretAccessKey: "secret",
    };
    expect(s3BlobStore(opts).publicUrl("memes/x.jpg")).toBe(
      "https://flicko-test.s3.ap-south-1.amazonaws.com/memes/x.jpg",
    );
    expect(
      s3BlobStore({
        ...opts,
        publicBaseUrl: "https://cdn.flicko.app/",
      }).publicUrl("memes/x.jpg"),
    ).toBe("https://cdn.flicko.app/memes/x.jpg");
  });
});
