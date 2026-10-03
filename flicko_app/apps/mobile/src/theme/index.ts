// Flicko design tokens. Copy to apps/mobile/src/theme/index.ts
export const colors = {
  bg: "#0E0B14",
  surface: "#17141F",
  surfaceRaised: "#1C1826",
  surfaceSunken: "#221B2E",
  border: "#2C2738",
  borderStrong: "#3A3248",

  accent: "#FF2D95", // primary actions only, one per screen
  accentPressed: "#E01E7F",
  accentSoft: "rgba(255,45,149,0.12)",
  accentText: "#FF8CC4", // pink text on dark surfaces

  gain: "#2BD9A3",
  loss: "#FF4D4F",
  warning: "#FFB21A", // devnet pill

  text: "#FFFFFF",
  textMuted: "#A49DB5",
  textFaint: "#6F6880",
  scrim: "rgba(5,4,8,0.66)",
} as const;

export const fonts = {
  display: "BricolageGrotesque_800ExtraBold", // headlines: "Every photo is a coin.", "gm"
  displayBold: "BricolageGrotesque_700Bold",
  body: "DMSans_400Regular",
  bodyMedium: "DMSans_500Medium",
  bodyBold: "DMSans_700Bold",
  wordmark: "Unbounded_800ExtraBold", // only the "flicko" wordmark
} as const;

export const type = {
  hero: {
    fontFamily: fonts.display,
    fontSize: 44,
    lineHeight: 45,
    letterSpacing: -1.8,
  },
  gm: {
    fontFamily: fonts.display,
    fontSize: 88,
    lineHeight: 88,
    letterSpacing: -4,
  },
  h1: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 36,
    letterSpacing: -1.4,
  },
  sheetTitle: { fontFamily: fonts.bodyBold, fontSize: 22, lineHeight: 28 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23 },
  bodySm: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  button: { fontFamily: fonts.bodyBold, fontSize: 17 },
  caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  legal: { fontFamily: fonts.body, fontSize: 11, lineHeight: 14 },
} as const;

export const radius = { sm: 12, md: 16, lg: 18, xl: 28, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const size = {
  buttonHeight: 56,
  secondaryHeight: 48,
  inputHeight: 56,
  touchMin: 48,
  screenPadding: 24,
} as const;

export const motion = {
  intro: { focus: 250, snap: 150, trade: 350, reveal: 350 }, // ms, total ~1.1s
  sheet: { damping: 22, stiffness: 220 },
  wallColumnLoopMs: [38000, 46000, 42000],
  wallTickMs: 2400,
} as const;

/*
 * Exact values used by the approved reference HTML (design-reference/*.html) where they
 * differ slightly from the tokens above, so the screens match the designs pixel for pixel.
 */
export const ref = {
  sheet: "#17121F", // sheet and input background
  line: "#2E273E", // sheet top border, spinner track, upcoming step bar
  lineDashed: "#4A4458",
  textBright: "#E4DDF2", // text buttons, chips, address chip
  textSoft: "#B9AED3", // sheet body copy, labels
  textSubtle: "#8E84A6", // helper and status lines
  check: "#3DF5C4", // check marks, valid input border, seal
  pillBg: "rgba(14,11,20,0.78)",
  walletTile: "#2A2536",
  walletTileText: "#8E86A0",
  seekerBg: "#12261F",
  seekerBorder: "#1F4A3A",
  seekerText: "#8FD9C0",
} as const;

/*
 * Camera home (design-reference/Camera.html): floating glass controls over the preview
 * and the shared bottom tab bar.
 */
export const cam = {
  glass: "rgba(14,11,20,0.40)",
  glassBorder: "rgba(255,255,255,0.18)",
  chipText: "rgba(255,255,255,0.75)",
  thumbRing: "rgba(255,255,255,0.85)",
  coin: "#FFD24A",
  coinRim: "#C98F12",
  tabInactive: "#8E86A0",
} as const;

/*
 * Feed and buy sheet (flicko_feed design): Geist for UI text (never above 600), Geist
 * Mono for prices, counts and supply numbers.
 */
export const feed = {
  bg: "#0B0B0F",
  surface: "rgba(23,22,29,0.92)", // #17161D at 92%
  sheet: "#15141A",
  raised: "#1F1D26",
  border: "#2A2833",
  borderStrong: "#3A3744",
  text: "#F5F3F7",
  textSecondary: "#B9B5C4",
  textMuted: "#9C98A8",
  navInactive: "#8C8898",
  accent: "#E5137A",
  pinkText: "#FFB3D4",
  liked: "#FF2E88",
  lime: "#C8FF4D",
  dim: "rgba(5,5,8,0.72)",
  glass: "rgba(11,11,15,0.5)",
} as const;

export const geist = {
  regular: "Geist_400Regular",
  medium: "Geist_500Medium",
  semibold: "Geist_600SemiBold",
  mono: "GeistMono_400Regular",
  monoMedium: "GeistMono_500Medium",
} as const;
