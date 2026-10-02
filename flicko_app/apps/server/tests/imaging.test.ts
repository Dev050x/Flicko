import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import {
  normalise,
  preview,
  renderMeme,
  sha256Hex,
  wrapCaption,
} from "../src/media/imaging";
import { HttpError } from "../src/middleware/errors";

const photo = (
  width: number,
  height: number,
  format: "png" | "jpeg" = "jpeg",
) =>
  sharp({
    create: { width, height, channels: 3, background: "#33aa66" },
  })
    [format]()
    .toBuffer()
    .then((buffer) => new Uint8Array(buffer));

describe("normalise", () => {
  test("fits large photos into 1080x1350 as jpeg", async () => {
    const out = await normalise(await photo(1600, 1200, "png"));
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(810);
  });

  test("never enlarges small photos", async () => {
    const meta = await sharp(await normalise(await photo(400, 300))).metadata();
    expect([meta.width, meta.height]).toEqual([400, 300]);
  });

  test("rejects bytes that are not an image", async () => {
    const err = await normalise(new Uint8Array([1, 2, 3, 4])).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(400);
  });
});

describe("preview", () => {
  test("downscales to at most 768px", async () => {
    const meta = await sharp(await preview(await photo(1080, 1350))).metadata();
    expect(meta.height).toBe(768);
    expect(meta.width).toBeLessThanOrEqual(768);
  });
});

describe("renderMeme", () => {
  test("keeps the size and draws the caption", async () => {
    const base = await photo(1080, 1350);
    const out = await renderMeme(base, "gm ser", "wen moon & <lambo>");
    const meta = await sharp(out).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual([
      "jpeg",
      1080,
      1350,
    ]);
    const { data } = await sharp(out)
      .extract({ left: 0, top: 0, width: 1080, height: 300 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const white = data.filter((value, i) => i % 3 === 0 && value > 240).length;
    expect(white).toBeGreaterThan(1000);
  });

  test("an empty caption leaves the photo looking the same", async () => {
    const base = await photo(200, 200);
    const out = await renderMeme(base, "", "");
    const stats = await sharp(out).stats();
    expect(stats.channels[0]!.max).toBeLessThan(80);
  });
});

describe("wrapCaption", () => {
  test("keeps short captions on one line and balances long ones", () => {
    expect(wrapCaption("")).toEqual([]);
    expect(wrapCaption("gm ser")).toEqual(["GM SER"]);
    expect(wrapCaption("when the dip keeps on dipping")).toEqual([
      "WHEN THE DIP",
      "KEEPS ON DIPPING",
    ]);
  });
});

describe("sha256Hex", () => {
  test("matches the known vector", () => {
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
