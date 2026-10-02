import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import Svg, { G, Path } from "react-native-svg";

import {
  bracketPath,
  bracketsPath,
  colors,
  CORNER_STROKE,
  focusColors,
  GLYPH_STROKE,
  partialCrossbar,
  partialHead,
  partialStem,
} from "@/brand/logo";
import { BrandDefs } from "@/components/brand/brand-defs";
import { Glow } from "@/components/brand/glow";
import { TileFill } from "@/components/brand/logo-tile";
import { Wordmark } from "@/components/brand/wordmark";
import { SplashFrame } from "./splash-frame";

/*
 * Timeline (ms). The design's keyframes at a slower pace:
 * - focus: the splash fades out, the corners appear wide, hold, then ease into the icon;
 * - snap: the corners lock and turn white while the flash bursts and fades;
 * - trade: the logo assembles one piece at a time, each finishing before the next: the
 *   tile springs in behind the corners, the "f" stem draws upward, the crossbar draws
 *   across, the arrow head completes it;
 * - reveal: after a short hold the finished logo glides up and shrinks while the
 *   wordmark and tagline fade up beneath it.
 */
export const TIMELINE = {
  splashOut: 150,
  appear: 230,
  pull: 330,
  snap: 750,
  flashPeak: 820,
  trade: 1150,
  stem: 1550,
  crossbar: 1950,
  head: 2200,
  assembled: 2450,
  reveal: 2750,
  wordmark: 3150,
  tagline: 3250,
  end: 3700,
} as const;
const {
  splashOut: SPLASH_OUT,
  appear: APPEAR,
  pull: PULL,
  snap: SNAP,
  flashPeak: FLASH_PEAK,
} = TIMELINE;
const { trade: TRADE, stem: STEM, crossbar: CROSSBAR } = TIMELINE;
const { head: HEAD, assembled: ASSEMBLED, reveal: REVEAL } = TIMELINE;
const { wordmark: WORDMARK, tagline: TAGLINE, end: END } = TIMELINE;

/*
 * The reveal motion runs from REVEAL to LIFTED; the text keeps fading in until END.
 */
const LIFTED = REVEAL + 600;
const HOLD = 300;
const FADE_OUT = 280;
const REDUCED_FADE = 200;

/*
 * Corners start wide (frame 1: a 150px box on the 240px artboard) and lock to the icon
 * (inset 16, arm 18, radius 8), in units of the 96px tile's 100x100 viewBox.
 */
const WIDE = { inset: -21.9, arm: 34.4, radius: 12.5, stroke: 6.25 };
const LOCKED = { inset: 16, arm: 18, radius: 8, stroke: CORNER_STROKE };

/*
 * The corners svg is larger than the tile so the wide corners fit around it.
 */
const CANVAS = { min: -30, size: 160 };

const easeOut = Easing.out(Easing.cubic);
const easeInOut = Easing.inOut(Easing.cubic);
/*
 * Damped spring as a function of progress (0..1), settling at 1 with one soft overshoot.
 */
const spring = (t: number) => {
  "worklet";
  return 1 - Math.exp(-6 * t) * Math.cos(9 * t);
};

const AnimatedPath = Animated.createAnimatedComponent(Path);

const progress = (clock: number, from: number, to: number) => {
  "worklet";
  return Math.min(1, Math.max(0, (clock - from) / (to - from)));
};

/*
 * The intro from the design: the viewfinder focuses, the shutter flashes, the "f"
 * draws up into the trading arrow, then the wordmark is revealed. Returning users only
 * see frames 1-3, Reduce Motion gets a 200ms fade of frame 4, and a tap skips ahead.
 * The app renders underneath, so the intro never blocks it.
 */
export function Intro({
  full,
  onStart,
  onDone,
}: {
  full: boolean;
  onStart: () => void;
  onDone: () => void;
}) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const clock = useSharedValue(0);
  const fade = useSharedValue(reduceMotion ? 0 : 1);
  const exit = useSharedValue(1);
  const finished = useRef(false);

  /*
   * Design units: the intro artboard is 240px wide, the icon tile 96px.
   */
  const stop = full ? END : REVEAL;

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    onDone();
  };

  const leave = (delay: number) => {
    exit.value = withDelay(
      delay,
      withTiming(0, { duration: FADE_OUT }, (done) => {
        if (done) scheduleOnRN(finish);
      }),
    );
  };

  useEffect(() => {
    onStart();
    if (reduceMotion) {
      clock.value = END;
      fade.value = withTiming(1, { duration: REDUCED_FADE });
      leave(REDUCED_FADE + HOLD);
      return;
    }

    clock.value = withTiming(stop, { duration: stop, easing: Easing.linear });
    leave(stop + (full ? HOLD : 0));

    const snap = setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }, SNAP);
    return () => clearTimeout(snap);
    // Plays once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skip = () => {
    if (finished.current) return;
    clock.value = withTiming(stop, { duration: 150 });
    leave(150);
  };

  const root = useAnimatedStyle(() => ({ opacity: exit.value }));
  const content = useAnimatedStyle(() => ({ opacity: fade.value }));
  const splash = useAnimatedStyle(() => ({
    opacity: interpolate(clock.value, [0, SPLASH_OUT], [1, 0], "clamp"),
  }));

  return (
    <Animated.View style={[styles.root, root]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={skip}>
        <Animated.View style={[StyleSheet.absoluteFill, splash]}>
          <SplashFrame />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, content]}>
          <IntroScene clock={clock} width={width} />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/*
 * Everything the intro draws at time `clock` (ms), laid out in a box `width` wide using the
 * design's 240px artboard units. Fills its parent.
 */
export function IntroScene({
  clock,
  width,
}: {
  clock: SharedValue<number>;
  width: number;
}) {
  const u = width / 240;
  return (
    <>
      <Flash clock={clock} size={260 * u} />
      <Icon clock={clock} tile={96 * u} u={u} />
      <Reveal clock={clock} u={u} />
    </>
  );
}

/*
 * Frame 2: white shutter flash behind the locking corners, CSS
 * `radial-gradient(circle, white .95 0%, white .35 35%, transparent 70%)` on 260px.
 */
const FLASH_STOPS = [
  { offset: 0, opacity: 0.95 },
  { offset: 0.35, opacity: 0.35 },
  { offset: 0.7, opacity: 0 },
];

function Flash({ clock, size }: { clock: SharedValue<number>; size: number }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(
      clock.value,
      [SNAP, FLASH_PEAK, TRADE],
      [0, 1, 0],
      "clamp",
    ),
    transform: [
      {
        scale: interpolate(
          clock.value,
          [SNAP, FLASH_PEAK, TRADE],
          [0.6, 1, 1.08],
          "clamp",
        ),
      },
    ],
  }));
  return (
    <View style={styles.layer} pointerEvents="none">
      <Animated.View style={style}>
        <Glow size={size} color="#ffffff" id="flash" stops={FLASH_STOPS} />
      </Animated.View>
    </View>
  );
}

/*
 * Corners, tile and "f" arrow. During the reveal the whole icon lifts and shrinks to 76px,
 * centred 54px above the middle of the 536px artboard.
 */
function Icon({
  clock,
  tile,
  u,
}: {
  clock: SharedValue<number>;
  tile: number;
  u: number;
}) {
  const canvas = tile * (CANVAS.size / 100);

  const lift = useAnimatedStyle(() => {
    const t = easeInOut(progress(clock.value, REVEAL, LIFTED));
    return {
      transform: [
        { translateY: -LOCKUP.lift * u * t },
        { scale: 1 - ((96 - LOCKUP.tile) / 96) * t },
      ],
    };
  });

  const fill = useAnimatedStyle(() => {
    const t = progress(clock.value, TRADE, STEM);
    return {
      opacity: progress(clock.value, TRADE, TRADE + 120),
      transform: [{ scale: 0.55 + 0.45 * spring(t) }],
    };
  });

  const lockedCorners = useAnimatedProps(() => ({
    ...corners(clock.value, -1),
    opacity: progress(clock.value, SNAP, SNAP + 50),
  }));

  return (
    <View style={styles.layer} pointerEvents="none">
      <Animated.View style={[{ width: canvas, height: canvas }, lift]}>
        <View style={styles.layer}>
          <Animated.View style={[{ width: tile, height: tile }, fill]}>
            <Svg width={tile} height={tile} viewBox="0 0 100 100">
              <BrandDefs />
              <TileFill />
            </Svg>
          </Animated.View>
        </View>
        <View style={styles.layer}>
          <Svg
            width={canvas}
            height={canvas}
            viewBox={`${CANVAS.min} ${CANVAS.min} ${CANVAS.size} ${CANVAS.size}`}
          >
            <G fill="none" strokeLinecap="round" strokeLinejoin="round">
              {focusColors.map((color, corner) => (
                <FocusCorner
                  key={corner}
                  clock={clock}
                  corner={corner}
                  color={color}
                />
              ))}
              <AnimatedPath stroke="#fff" animatedProps={lockedCorners} />
              {GLYPH_STROKES.map((stroke, part) => (
                <GlyphStroke key={part} clock={clock} part={part} />
              ))}
            </G>
          </Svg>
        </View>
      </Animated.View>
    </View>
  );
}

/*
 * Corner geometry at time `clock`: wide until PULL, then an ease-out into the locked
 * logo by SNAP. `corner` -1 draws all four.
 */
const corners = (clock: number, corner: number) => {
  "worklet";
  const t = easeOut(progress(clock, PULL, SNAP));
  const lerp = (a: number, b: number) => a + (b - a) * t;
  const inset = lerp(WIDE.inset, LOCKED.inset);
  const arm = lerp(WIDE.arm, LOCKED.arm);
  const radius = lerp(WIDE.radius, LOCKED.radius);
  return {
    d:
      corner < 0
        ? bracketsPath(inset, arm, radius)
        : bracketPath(corner, inset, arm, radius),
    strokeWidth: lerp(WIDE.stroke, LOCKED.stroke),
  };
};

/*
 * The "f" strokes in drawing order (stem, crossbar, arrow head) with when each one draws.
 */
const GLYPH_STROKES = [
  { from: STEM, to: CROSSBAR },
  { from: CROSSBAR, to: HEAD },
  { from: HEAD, to: ASSEMBLED },
];

/*
 * Stroke `part` of the "f" drawn up to fraction `f`.
 */
const glyphPath = (part: number, f: number) => {
  "worklet";
  if (part === 0) return partialStem(f);
  if (part === 1) return partialCrossbar(f);
  return partialHead(f);
};

/*
 * Frame 3: one stroke of the "f" growing from its start. The UI thread reports progress
 * and the stroke renders as a plain Path, which Android draws reliably. Hidden until it
 * begins so the round cap does not show as a dot.
 */
function GlyphStroke({
  clock,
  part,
}: {
  clock: SharedValue<number>;
  part: number;
}) {
  const { from, to } = GLYPH_STROKES[part]!;
  const [t, setT] = useState(0);
  useAnimatedReaction(
    () => Math.round(easeOut(progress(clock.value, from, to)) * 100) / 100,
    (next, previous) => {
      if (next !== previous) scheduleOnRN(setT, next);
    },
  );
  if (t <= 0) return null;
  return (
    <Path
      d={glyphPath(part, t)}
      stroke="#fff"
      strokeWidth={GLYPH_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  );
}

/*
 * Frame 1: one solid-coloured corner. It fades in wide after the splash and hands over
 * to the white corners on SNAP.
 */
function FocusCorner({
  clock,
  corner,
  color,
}: {
  clock: SharedValue<number>;
  corner: number;
  color: string;
}) {
  const props = useAnimatedProps(() => ({
    ...corners(clock.value, corner),
    opacity:
      progress(clock.value, SPLASH_OUT, APPEAR) *
      (1 - progress(clock.value, SNAP, SNAP + 50)),
  }));
  return <AnimatedPath stroke={color} animatedProps={props} />;
}

/*
 * Frame 4: wordmark (34px, top at +4px from centre) and tagline (13px, +58px) fade up.
 * These positions are shared with the home screen so the hand-off is seamless.
 */
export const LOCKUP = {
  lift: 54,
  tile: 76,
  wordmarkTop: 4,
  wordmarkSize: 34,
  wordmarkSpacing: -1.2,
  taglineTop: 58,
  taglineSize: 13,
} as const;

function Reveal({ clock, u }: { clock: SharedValue<number>; u: number }) {
  return (
    <>
      <RevealLine
        clock={clock}
        from={WORDMARK}
        top={LOCKUP.wordmarkTop * u}
        u={u}
      >
        <Wordmark
          size={LOCKUP.wordmarkSize * u}
          letterSpacing={LOCKUP.wordmarkSpacing * u}
        />
      </RevealLine>
      <RevealLine
        clock={clock}
        from={TAGLINE}
        top={LOCKUP.taglineTop * u}
        u={u}
      >
        <Text
          className="font-sans text-haze"
          style={{ fontSize: LOCKUP.taglineSize * u }}
        >
          Snap it. Caption it. Trade it.
        </Text>
      </RevealLine>
    </>
  );
}

/*
 * One line of the reveal: fades in and rises 12px over 450ms starting at `from`.
 */
function RevealLine({
  clock,
  from,
  top,
  u,
  children,
}: {
  clock: SharedValue<number>;
  from: number;
  top: number;
  u: number;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    const t = easeOut(progress(clock.value, from, from + 450));
    return { opacity: t, transform: [{ translateY: 12 * u * (1 - t) }] };
  });
  return (
    <View style={[styles.below, { marginTop: top }]} pointerEvents="none">
      <Animated.View style={style}>{children}</Animated.View>
    </View>
  );
}

/*
 * Reanimated views ignore className, so the overlay is styled here. `layer` centres one
 * element on the screen; `below` places one under the centre line.
 */
const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: colors.bg },
  layer: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  below: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "50%",
    alignItems: "center",
  },
});
