import { Resvg } from "@resvg/resvg-js";
import { join } from "node:path";
import sharp from "sharp";
import { HttpError } from "../middleware/errors";

const FONT_PATH = join(import.meta.dir, "../../assets/fonts/Anton-Regular.ttf");
const MAX_WIDTH = 1080;
const MAX_HEIGHT = 1350;
const PREVIEW_SIZE = 768;
const MARGIN = 0.04;

export const normalise = async (input: Uint8Array) => {
  try {
    return new Uint8Array(
      await sharp(input)
        .rotate()
        .resize(MAX_WIDTH, MAX_HEIGHT, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer(),
    );
  } catch {
    throw new HttpError(400, "not an image");
  }
};

export const preview = async (jpeg: Uint8Array) =>
  new Uint8Array(
    await sharp(jpeg)
      .resize(PREVIEW_SIZE, PREVIEW_SIZE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toBuffer(),
  );

const escapeXml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[char]!,
  );

export const wrapCaption = (text: string): string[] => {
  const words = text.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const whole = words.join(" ");
  if (words.length === 1 || whole.length <= 20) return [whole];
  let best = [whole];
  let bestLongest = whole.length;
  for (let split = 1; split < words.length; split++) {
    const lines = [
      words.slice(0, split).join(" "),
      words.slice(split).join(" "),
    ];
    const longest = Math.max(...lines.map((line) => line.length));
    if (longest < bestLongest) {
      best = lines;
      bestLongest = longest;
    }
  }
  return best;
};

const captionSvg = (
  width: number,
  height: number,
  top: string[],
  bottom: string[],
) => {
  const longest = Math.max(1, ...[...top, ...bottom].map((l) => l.length));
  const fontSize = Math.round(
    Math.min(width * 0.12, height * 0.09, (width * 1.9) / longest),
  );
  const lineHeight = fontSize * 1.1;
  const x = width / 2;
  const margin = height * MARGIN;
  const topLines = top.map(
    (line, i) =>
      `<text x="${x}" y="${(margin + fontSize + i * lineHeight).toFixed(1)}">${escapeXml(line)}</text>`,
  );
  const bottomLines = bottom.map(
    (line, i) =>
      `<text x="${x}" y="${(height - margin - (bottom.length - 1 - i) * lineHeight).toFixed(1)}">${escapeXml(line)}</text>`,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><g font-family="Anton" font-size="${fontSize}" fill="#ffffff" stroke="#000000" stroke-width="${(fontSize / 8).toFixed(1)}" stroke-linejoin="round" paint-order="stroke" text-anchor="middle">${[...topLines, ...bottomLines].join("")}</g></svg>`;
};

export const renderMeme = async (
  jpeg: Uint8Array,
  top: string,
  bottom: string,
) => {
  const { width, height } = await sharp(jpeg).metadata();
  if (!width || !height) throw new HttpError(400, "not an image");
  const svg = captionSvg(width, height, wrapCaption(top), wrapCaption(bottom));
  const overlay = new Resvg(svg, {
    font: {
      fontFiles: [FONT_PATH],
      loadSystemFonts: false,
      defaultFontFamily: "Anton",
    },
  })
    .render()
    .asPng();
  return new Uint8Array(
    await sharp(jpeg)
      .composite([{ input: overlay }])
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer(),
  );
};

export const sha256Hex = (bytes: Uint8Array) =>
  new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
