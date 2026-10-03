/*
 * Meme Wall items from assets/meme-wall/manifest.json with static requires (Metro needs
 * literal paths). Thumbs are 360x450; full/ is for later. Generated from the manifest.
 */
import manifest from "../../../assets/meme-wall/manifest.json";

const thumbs: Record<string, number> = {
  "01-gm-coffee.jpg": require("../../../assets/meme-wall/thumbs/01-gm-coffee.jpg"),
  "02-beach-chill.jpg": require("../../../assets/meme-wall/thumbs/02-beach-chill.jpg"),
  "03-to-the-moon.jpg": require("../../../assets/meme-wall/thumbs/03-to-the-moon.jpg"),
  "04-rekt-rain.jpg": require("../../../assets/meme-wall/thumbs/04-rekt-rain.jpg"),
  "05-laptop-trader.jpg": require("../../../assets/meme-wall/thumbs/05-laptop-trader.jpg"),
  "06-diamond-hands.jpg": require("../../../assets/meme-wall/thumbs/06-diamond-hands.jpg"),
  "07-laser-eyes.jpg": require("../../../assets/meme-wall/thumbs/07-laser-eyes.jpg"),
  "08-party-hats.jpg": require("../../../assets/meme-wall/thumbs/08-party-hats.jpg"),
  "09-wake-me-at-100x.jpg": require("../../../assets/meme-wall/thumbs/09-wake-me-at-100x.jpg"),
  "10-banana-hotline.jpg": require("../../../assets/meme-wall/thumbs/10-banana-hotline.jpg"),
  "11-gym-gains.jpg": require("../../../assets/meme-wall/thumbs/11-gym-gains.jpg"),
  "12-pizza-day.jpg": require("../../../assets/meme-wall/thumbs/12-pizza-day.jpg"),
  "13-hodl-hug.jpg": require("../../../assets/meme-wall/thumbs/13-hodl-hug.jpg"),
  "14-astro-ape.jpg": require("../../../assets/meme-wall/thumbs/14-astro-ape.jpg"),
  "15-rich-ape.jpg": require("../../../assets/meme-wall/thumbs/15-rich-ape.jpg"),
  "16-detective.jpg": require("../../../assets/meme-wall/thumbs/16-detective.jpg"),
  "17-dj-drop.jpg": require("../../../assets/meme-wall/thumbs/17-dj-drop.jpg"),
  "18-wagmi-squad.jpg": require("../../../assets/meme-wall/thumbs/18-wagmi-squad.jpg"),
};

export interface WallItem {
  id: string;
  caption: string;
  change: string;
  image: number;
}

export const wallItems: WallItem[] = manifest.map((item) => ({
  id: item.file,
  caption: item.caption,
  change: item.change,
  image: thumbs[item.file]!,
}));
