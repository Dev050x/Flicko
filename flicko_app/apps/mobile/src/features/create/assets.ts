import {
  Skia,
  type SkImage,
  type SkTypeface,
} from "@shopify/react-native-skia";
import { Asset } from "expo-asset";
import type { ImageSourcePropType } from "react-native";

import type { TextStyle } from "./store";

/*
 * Images and fonts the editor draws with Skia, loaded once and cached: the photo, the
 * sticker art and the TTFs behind the text styles (Skia can't use the app's loaded
 * fonts, so it reads the same files).
 */
export const STICKERS: { id: string; name: string; source: ImageSourcePropType }[] = [
  {
    id: "candle-up",
    name: "Pump candle",
    source: require("../../../assets/filters/overlays/sticker-candle-up.png"),
  },
  {
    id: "chart-down",
    name: "Chart down",
    source: require("../../../assets/filters/overlays/sticker-chart-down.png"),
  },
  {
    id: "skr-coin",
    name: "SKR coin",
    source: require("../../../assets/filters/overlays/sticker-skr-coin.png"),
  },
  {
    id: "bobo-cheer",
    name: "Bobo cheering",
    source: require("../../../assets/characters/bobo-cheer.png"),
  },
  {
    id: "bobo-gang",
    name: "Bobo and friends",
    source: require("../../../assets/characters/monkeys-sticker.png"),
  },
];

const FONT_FILES: Record<TextStyle | "caption", number> = {
  meme: require("@expo-google-fonts/unbounded/800ExtraBold/Unbounded_800ExtraBold.ttf"),
  caption: require("@expo-google-fonts/unbounded/800ExtraBold/Unbounded_800ExtraBold.ttf"),
  clean: require("@expo-google-fonts/dm-sans/700Bold/DMSans_700Bold.ttf"),
  label: require("@expo-google-fonts/dm-sans/700Bold/DMSans_700Bold.ttf"),
};

const images = new Map<unknown, Promise<SkImage>>();
const typefaces = new Map<number, Promise<SkTypeface>>();

const localUri = async (source: number) => {
  const asset = Asset.fromModule(source);
  await asset.downloadAsync();
  return asset.localUri ?? asset.uri;
};

const decode = async (uri: string) => {
  const image = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(uri));
  if (!image) throw new Error(`could not decode ${uri}`);
  return image;
};

const cached = <K, V>(map: Map<K, Promise<V>>, key: K, load: () => Promise<V>) => {
  let value = map.get(key);
  if (!value) {
    value = load();
    value.catch(() => map.delete(key));
    map.set(key, value);
  }
  return value;
};

export const loadPhoto = (uri: string) => cached(images, uri, () => decode(uri));

export const loadArt = (source: ImageSourcePropType) =>
  cached(images, source, async () => decode(await localUri(source as number)));

const loadTypeface = (file: number) =>
  cached(typefaces, file, async () => {
    const face = Skia.Typeface.MakeFreeTypeFaceFromData(
      await Skia.Data.fromURI(await localUri(file)),
    );
    if (!face) throw new Error("font could not be loaded");
    return face;
  });

export interface SceneAssets {
  photo: SkImage;
  /** sticker id or overlay module → image */
  art: Map<unknown, SkImage>;
  fonts: Record<TextStyle | "caption", SkTypeface>;
}

/*
 * Everything one scene needs; `art` lists the overlays and stickers it draws.
 */
export const loadSceneAssets = async (
  photoUri: string,
  art: { key: unknown; source: ImageSourcePropType }[],
): Promise<SceneAssets> => {
  const [photo, loadedArt, meme, clean] = await Promise.all([
    loadPhoto(photoUri),
    Promise.all(art.map(async (a) => [a.key, await loadArt(a.source)] as const)),
    loadTypeface(FONT_FILES.meme),
    loadTypeface(FONT_FILES.clean),
  ]);
  return {
    photo,
    art: new Map(loadedArt),
    fonts: { meme, caption: meme, clean, label: clean },
  };
};

export const stickerById = (id: string) => STICKERS.find((s) => s.id === id);
