import type { Meme } from "./types";

/*
 * Mock feed for milestones 1-2 (meme-wall art; captions are baked into the images).
 */
const wall = {
  moon: require("../../../assets/meme-wall/full/03-to-the-moon.jpg"),
  laser: require("../../../assets/meme-wall/full/07-laser-eyes.jpg"),
  astro: require("../../../assets/meme-wall/full/14-astro-ape.jpg"),
  diamond: require("../../../assets/meme-wall/full/06-diamond-hands.jpg"),
  rekt: require("../../../assets/meme-wall/full/04-rekt-rain.jpg"),
  coffee: require("../../../assets/meme-wall/full/01-gm-coffee.jpg"),
};
const thumb = {
  coffee: require("../../../assets/meme-wall/thumbs/01-gm-coffee.jpg"),
  laser: require("../../../assets/meme-wall/thumbs/07-laser-eyes.jpg"),
  ape: require("../../../assets/meme-wall/thumbs/15-rich-ape.jpg"),
  detective: require("../../../assets/meme-wall/thumbs/16-detective.jpg"),
};

const now = Date.now();
const MIN = 60_000;
const HOUR = 60 * MIN;

/* A rising, slightly noisy price path ending at `end`. */
const history = (start: number, end: number, points = 14) =>
  Array.from({ length: points }, (_, i) => {
    const t = i / (points - 1);
    const wobble = i % 3 === 1 ? -0.06 : i % 3 === 2 ? 0.03 : 0;
    return start + (end - start) * (t + wobble * (1 - t));
  });

export const MOCK_MEMES: Meme[] = [
  {
    id: "candle",
    imageUrl: wall.moon,
    creator: { handle: "degen_dev", avatarUrl: thumb.coffee, isFollowing: false },
    ticker: "CANDLE",
    createdAt: now - 2 * HOUR,
    status: "launching",
    supplyTotal: 1000,
    supplySold: 742,
    launchPrice: 0.00042,
    likeCount: 4800,
    commentCount: 312,
    likedByMe: false,
  },
  {
    id: "dip",
    imageUrl: wall.laser,
    creator: { handle: "laser_lord", avatarUrl: thumb.laser, isFollowing: true },
    ticker: "DIP",
    createdAt: now - 9 * HOUR,
    status: "trading",
    supplyTotal: 1000,
    supplySold: 1000,
    launchPrice: 0.42,
    poolPrice: 1.84,
    changeSinceLaunchPct: 338,
    priceHistory: history(0.42, 1.84),
    soldOutDurationMin: 41,
    likeCount: 21300,
    commentCount: 1100,
    likedByMe: false,
  },
  {
    id: "astro",
    imageUrl: wall.astro,
    creator: { handle: "ape_capital", avatarUrl: thumb.ape, isFollowing: false },
    ticker: "ASTRO",
    createdAt: now - 25 * MIN,
    status: "launching",
    supplyTotal: 5000,
    supplySold: 1260,
    launchPrice: 0.1,
    likeCount: 932,
    commentCount: 48,
    likedByMe: false,
  },
  {
    id: "hodl",
    imageUrl: wall.diamond,
    creator: { handle: "degen_dev", avatarUrl: thumb.coffee, isFollowing: false },
    ticker: "HODL",
    createdAt: now - 2 * 24 * HOUR,
    status: "trading",
    supplyTotal: 2000,
    supplySold: 2000,
    launchPrice: 0.25,
    poolPrice: 0.61,
    changeSinceLaunchPct: 144,
    priceHistory: history(0.25, 0.61),
    soldOutDurationMin: 128,
    likeCount: 8700,
    commentCount: 506,
    likedByMe: true,
  },
  {
    id: "rekt",
    imageUrl: wall.rekt,
    creator: { handle: "sherlock_sol", avatarUrl: thumb.detective, isFollowing: true },
    ticker: "REKT",
    createdAt: now - 5 * HOUR,
    status: "launching",
    supplyTotal: 1000,
    supplySold: 968,
    launchPrice: 0.05,
    likeCount: 2100,
    commentCount: 97,
    likedByMe: false,
  },
  {
    id: "gm",
    imageUrl: wall.coffee,
    creator: { handle: "laser_lord", avatarUrl: thumb.laser, isFollowing: true },
    ticker: "GM",
    createdAt: now - 3 * 24 * HOUR,
    status: "trading",
    supplyTotal: 10000,
    supplySold: 10000,
    launchPrice: 0.02,
    poolPrice: 0.09,
    changeSinceLaunchPct: 350,
    priceHistory: history(0.02, 0.09),
    soldOutDurationMin: 12,
    likeCount: 15400,
    commentCount: 820,
    likedByMe: false,
  },
];
