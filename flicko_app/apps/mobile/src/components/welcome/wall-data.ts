/*
 * Meme Wall items from assets/meme-wall/manifest.json with static requires (Metro needs
 * literal paths). Thumbs are 360x450; full/ is for later. Regenerate when the manifest
 * changes.
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
  "19-squad-selfie.jpg": require("../../../assets/meme-wall/thumbs/19-squad-selfie.jpg"),
  "20-were-so-back.jpg": require("../../../assets/meme-wall/thumbs/20-were-so-back.jpg"),
  "21-3am-group-chat.jpg": require("../../../assets/meme-wall/thumbs/21-3am-group-chat.jpg"),
  "22-couch-traders.jpg": require("../../../assets/meme-wall/thumbs/22-couch-traders.jpg"),
  "23-moon-crew.jpg": require("../../../assets/meme-wall/thumbs/23-moon-crew.jpg"),
  "24-beach-club.jpg": require("../../../assets/meme-wall/thumbs/24-beach-club.jpg"),
  "25-pizza-party.jpg": require("../../../assets/meme-wall/thumbs/25-pizza-party.jpg"),
  "26-board-meeting.jpg": require("../../../assets/meme-wall/thumbs/26-board-meeting.jpg"),
  "27-ape-tower.jpg": require("../../../assets/meme-wall/thumbs/27-ape-tower.jpg"),
  "28-family-portrait.jpg": require("../../../assets/meme-wall/thumbs/28-family-portrait.jpg"),
};

export interface WallItem {
  id: string;
  caption: string;
  change: string;
  group: boolean;
  image: number;
}

export const wallItems: WallItem[] = manifest.map((item) => ({
  id: item.file,
  caption: item.caption,
  change: item.change,
  group: item.group ?? false,
  image: thumbs[item.file]!,
}));
