import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Line, Path, Rect } from "react-native-svg";

import type { MemeView } from "@/features/meme/api";
import {
  TIMEFRAMES,
  useCandles,
  useSoldOverTime,
  useTrades,
  type CandleView,
  type SoldPoint,
  type Timeframe,
  type TradeView,
} from "@/features/meme/tabs";
import { useLiveTrades } from "@/features/meme/live";
import { priceCompact } from "@/lib/format";
import { detail as D, geist } from "@/theme";

import {
  LiveTradesTitle,
  TradeRow,
  TradeSheet,
  TradesFooter,
  TradesHeader,
  isLarge,
} from "./trade-row";

/*
 * Chart tab. Trading: price + 24H change, timeframe chips, candles with volume and a
 * press-and-drag crosshair, then the latest trades. Launching: the launch sale's
 * progress over time instead of candles, then the latest buys.
 */
const CHART_H = 150;
const VOL_H = 40;
const AXIS_H = 20;
const GUTTER = 56;
const CHART_GRID = "#17161D";
const LIVE_ROWS = 8;

const TF_LABEL: Record<Timeframe, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1H",
  "4h": "4H",
  "1d": "1D",
};

const two = (n: number) => String(n).padStart(2, "0");
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const timeLabel = (t: number, tf: Timeframe) => {
  const d = new Date(t);
  const day = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return tf === "1d"
    ? day
    : `${day}, ${two(d.getHours())}:${two(d.getMinutes())}`;
};

/** "+845%" / "−12.4%" */
export const signedPct = (pct: number) =>
  `${pct >= 0 ? "+" : "−"}${Math.abs(pct) >= 100 ? Math.round(Math.abs(pct)).toLocaleString("en-US") : Math.abs(pct).toFixed(1)}%`;

function PriceRow({ meme }: { meme: MemeView }) {
  const launching = meme.phase === "launching";
  const change = meme.change["24h"];
  return (
    <View style={styles.priceRow}>
      <View
        style={styles.priceLeft}
        accessible
        accessibilityLabel={`${meme.priceSkr} SKR`}
      >
        <Text style={styles.price}>{priceCompact(meme.priceSkr)}</Text>
        <Text style={styles.priceUnit}>SKR</Text>
      </View>
      {launching ? (
        <Text style={styles.note}>Launch price · rises as it sells</Text>
      ) : (
        <Text style={styles.changeText}>
          <Text style={[styles.num, { color: change >= 0 ? D.gain : D.loss }]}>
            {signedPct(change)}
          </Text>
          <Text style={{ color: D.muted }}> 24H</Text>
        </Text>
      )}
    </View>
  );
}

/** Chart prices: subscript zeros under 0.001 (0.0000064 → "0.0₅64"), else 4 significant digits. */
export const chartPrice = (n: number) =>
  n > 0 && n < 0.001 ? priceCompact(n) : String(Number(n.toPrecision(4)));

/* "O 0.00198  H 0.00204  L 0.00195  C 0.00201", close coloured by direction. */
function Legend({
  candle,
  tf,
  hovering,
}: {
  candle: CandleView | undefined;
  tf: Timeframe;
  hovering: boolean;
}) {
  if (!candle) return <View style={styles.legend} />;
  const up = candle.c >= candle.o;
  const pair = (k: string, v: number, color: string = D.text) => (
    <Text style={styles.legendItem}>
      <Text style={{ color: D.muted }}>{k} </Text>
      <Text style={{ color }}>{chartPrice(v)}</Text>
    </Text>
  );
  return (
    <View style={styles.legend}>
      {pair("O", candle.o)}
      {pair("H", candle.h)}
      {pair("L", candle.l)}
      {pair("C", candle.c, up ? D.gain : D.loss)}
      {hovering && (
        <Text style={[styles.legendItem, { color: D.muted }]}>
          {timeLabel(candle.t, tf)}
        </Text>
      )}
    </View>
  );
}

// Below this many candles the chart draws a close-price line instead.
const MIN_CANDLES = 15;

export function PriceChart({
  candles,
  width,
  tf,
  onHover,
}: {
  candles: CandleView[];
  width: number;
  tf: Timeframe;
  onHover: (index: number | null) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const plotW = width - GUTTER;
  const n = candles.length;
  const asLine = n < MIN_CANDLES;
  const slot = plotW / Math.max(n, 1);
  const body = Math.max(2, Math.min(5, slot * 0.7));

  let lo = Math.min(...candles.map((c) => (asLine ? c.c : c.l)));
  let hi = Math.max(...candles.map((c) => (asLine ? c.c : c.h)));
  if (hi === lo) {
    // one flat price must not stretch the scale: 10% above and below
    lo *= 0.9;
    hi *= 1.1;
  }
  const pad = (hi - lo) * 0.08;
  lo -= pad;
  hi += pad;
  const y = (v: number) => (1 - (v - lo) / (hi - lo)) * CHART_H;
  const x = (i: number) =>
    asLine && n > 1 ? (i / (n - 1)) * plotW : i * slot + slot / 2;
  const maxV = Math.max(...candles.map((c) => c.v), 0);
  const last = candles[n - 1];
  const grid = [5 / 6, 1 / 2, 1 / 6].map((f) => lo + (hi - lo) * f);
  const volTop = CHART_H + 6;
  const fullH = volTop + VOL_H;
  const line = candles
    .map((c, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(c.c)}`)
    .join("");

  const pick = (px: number) =>
    asLine && n > 1
      ? Math.max(0, Math.min(n - 1, Math.round((px / plotW) * (n - 1))))
      : Math.max(0, Math.min(n - 1, Math.floor(px / slot)));
  const set = (i: number | null) => {
    setHover(i);
    onHover(i);
  };
  // Press and hold, then drag: the hold lets vertical scrolling win otherwise.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .activateAfterLongPress(120)
    .onStart((e) => set(pick(e.x)))
    .onUpdate((e) => set(pick(e.x)))
    .onFinalize(() => set(null));

  const shown = hover !== null ? candles[hover] : null;
  const ticks = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : [0, n - 1];

  return (
    <GestureDetector gesture={pan}>
      <View
        style={{ width, height: fullH + AXIS_H }}
        accessibilityLabel="Price chart"
      >
        <Svg width={width} height={fullH}>
          {grid.map((v) => (
            <Line
              key={v}
              x1={0}
              x2={plotW}
              y1={y(v)}
              y2={y(v)}
              stroke={CHART_GRID}
              strokeWidth={1}
            />
          ))}
          {asLine ? (
            <Path
              d={line}
              stroke={D.gain}
              strokeWidth={2}
              fill="none"
              strokeLinejoin="round"
            />
          ) : (
            candles.map((c, i) => {
              const up = c.c >= c.o;
              const color = c.trades === 0 ? D.line : up ? D.gain : D.loss;
              return (
                <Rect
                  key={`b${c.t}`}
                  x={x(i) - body / 2}
                  y={y(Math.max(c.o, c.c))}
                  width={body}
                  height={Math.max(1, Math.abs(y(c.o) - y(c.c)))}
                  fill={color}
                />
              );
            })
          )}
          {!asLine &&
            candles.map((c, i) =>
              c.trades === 0 ? null : (
                <Line
                  key={`w${c.t}`}
                  x1={x(i)}
                  x2={x(i)}
                  y1={y(c.h)}
                  y2={y(c.l)}
                  stroke={c.c >= c.o ? D.gain : D.loss}
                  strokeWidth={1}
                />
              ),
            )}
          {maxV > 0 &&
            candles.map((c, i) =>
              c.v === 0 ? null : (
                <Rect
                  key={`v${c.t}`}
                  x={x(i) - body / 2}
                  y={fullH - (c.v / maxV) * VOL_H}
                  width={body}
                  height={(c.v / maxV) * VOL_H}
                  fill={
                    c.c >= c.o
                      ? "rgba(200,255,77,0.18)"
                      : "rgba(255,107,122,0.18)"
                  }
                />
              ),
            )}
          {last && (
            <Line
              x1={0}
              x2={plotW}
              y1={y(last.c)}
              y2={y(last.c)}
              stroke={last.c >= last.o ? D.gain : D.loss}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}
          {shown && hover !== null && (
            <>
              <Line
                x1={x(hover)}
                x2={x(hover)}
                y1={0}
                y2={fullH}
                stroke={D.muted}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <Line
                x1={0}
                x2={plotW}
                y1={y(shown.c)}
                y2={y(shown.c)}
                stroke={D.muted}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            </>
          )}
        </Svg>
        {grid.map((v) => (
          <Text
            key={v}
            style={[styles.axis, { top: y(v) - 7, left: plotW + 6 }]}
            numberOfLines={1}
          >
            {chartPrice(v)}
          </Text>
        ))}
        {last && (
          <View
            style={[styles.lastPill, { top: y(last.c) - 9, left: plotW + 2 }]}
          >
            <Text style={styles.lastText} numberOfLines={1}>
              {chartPrice(last.c)}
            </Text>
          </View>
        )}
        {shown && hover !== null && (
          <View
            style={[styles.crossPill, { top: y(shown.c) - 9, left: plotW + 2 }]}
          >
            <Text style={styles.crossText} numberOfLines={1}>
              {chartPrice(shown.c)}
            </Text>
          </View>
        )}
        {ticks.map((i, k) => (
          <Text
            key={`${i}-${k}`}
            style={[
              styles.timeTick,
              { top: fullH + 4 },
              k === 0
                ? { left: 0 }
                : k === ticks.length - 1
                  ? { right: GUTTER }
                  : { left: x(i) - 30, width: 60, textAlign: "center" },
            ]}
            numberOfLines={1}
          >
            {timeLabel(candles[i].t, tf)}
          </Text>
        ))}
      </View>
    </GestureDetector>
  );
}

export function SoldChart({
  points,
  width,
}: {
  points: SoldPoint[];
  width: number;
}) {
  const plotW = width - GUTTER;
  const t0 = points[0]?.t ?? Date.now();
  const t1 = Math.max(Date.now(), points[points.length - 1]?.t ?? t0);
  const x = (t: number) => (t1 === t0 ? plotW : ((t - t0) / (t1 - t0)) * plotW);
  const y = (pct: number) =>
    CHART_H - (Math.min(100, pct) / 100) * (CHART_H - 4);
  let line = "";
  points.forEach((p, i) => {
    line += i === 0 ? `M${x(p.t)},${y(p.pct)}` : `H${x(p.t)}V${y(p.pct)}`;
  });
  line += `H${plotW}`;
  const area = `${line}V${CHART_H}H${x(t0)}Z`;
  const current = points[points.length - 1]?.pct ?? 0;
  return (
    <View
      style={{ width, height: CHART_H }}
      accessibilityLabel={`${Math.floor(current)}% of the launch sold`}
    >
      <Svg width={width} height={CHART_H}>
        {[0.25, 0.5, 0.75].map((f) => (
          <Line
            key={f}
            x1={0}
            x2={plotW}
            y1={y(f * 100)}
            y2={y(f * 100)}
            stroke={D.grid}
            strokeWidth={1}
          />
        ))}
        <Path d={area} fill={D.accent} fillOpacity={0.12} />
        <Path
          d={line}
          stroke={D.accent}
          strokeWidth={2}
          fill="none"
          strokeLinejoin="round"
        />
      </Svg>
      {[25, 50, 75].map((pct) => (
        <Text
          key={pct}
          style={[styles.axis, { top: y(pct) - 7, left: plotW + 6 }]}
        >
          {pct}%
        </Text>
      ))}
      <View style={[styles.lastPill, { top: y(current) - 9, left: plotW + 2 }]}>
        <Text style={styles.lastText}>{Math.floor(current)}%</Text>
      </View>
    </View>
  );
}

function ChartPlaceholder({ text }: { text?: string }) {
  return (
    <View style={styles.placeholder}>
      <Text style={text ? styles.empty : styles.pending}>{text ?? "—"}</Text>
    </View>
  );
}

export function ChartTab({
  meme,
  width,
  wallet,
  bottomInset,
  onSeeAll,
}: {
  meme: MemeView;
  width: number;
  wallet: string | undefined;
  bottomInset: number;
  onSeeAll: () => void;
}) {
  const launching = meme.phase === "launching";
  const [tf, setTf] = useState<Timeframe>("15m");
  const candles = useCandles(meme.mint, tf, !launching);
  const [hover, setHover] = useState<number | null>(null);
  const sold = useSoldOverTime(meme.mint, launching);
  const trades = useTrades(meme.mint, true);
  const [touching, setTouching] = useState(false);
  const [sheet, setSheet] = useState<TradeView | null>(null);
  const source = useMemo(
    () => (trades.data?.pages[0]?.items ?? []).slice(0, LIVE_ROWS),
    [trades.data],
  );
  const live = useLiveTrades(source, touching, "chart");
  // live.rows only changes identity when the visible set changes
  const rows = useMemo(() => live.rows.slice(0, LIVE_ROWS), [live.rows]);
  const largeSkr = trades.data?.pages[0]?.largeSkr ?? null;
  const shownCandle =
    hover !== null
      ? candles.data?.[hover]
      : candles.data?.[candles.data.length - 1];
  const chartW = width - 32;

  return (
    <View style={{ gap: 16 }}>
      <PriceRow meme={meme} />

      {launching ? (
        <View style={styles.section}>
          {sold.data && sold.data.length > 0 ? (
            <SoldChart points={sold.data} width={chartW} />
          ) : (
            <ChartPlaceholder />
          )}
          <Text style={styles.note}>
            Candles start when the launch sells out and trading opens.
          </Text>
        </View>
      ) : (
        <View style={styles.section}>
          <View style={styles.chips}>
            {TIMEFRAMES.map((t) => {
              const on = t === tf;
              return (
                <Pressable
                  key={t}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setTf(t)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {TF_LABEL[t]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Legend candle={shownCandle} tf={tf} hovering={hover !== null} />
          {candles.data && candles.data.length > 0 ? (
            <PriceChart
              key={tf}
              candles={candles.data}
              width={chartW}
              tf={tf}
              onHover={setHover}
            />
          ) : (
            <ChartPlaceholder
              text={
                candles.data
                  ? "No trades yet. The chart starts with the first trade."
                  : undefined
              }
            />
          )}
        </View>
      )}

      <View
        style={styles.section}
        onTouchStart={() => setTouching(true)}
        onTouchEnd={() => setTouching(false)}
        onTouchCancel={() => setTouching(false)}
      >
        <View>
          <LiveTradesTitle onSeeAll={onSeeAll} />
          <TradesHeader symbol={meme.symbol} launching={launching} />
          {rows.map((t) => (
            <TradeRow
              key={t.id}
              trade={t}
              symbol={meme.symbol}
              large={isLarge(t, largeSkr)}
              mine={!!wallet && t.wallet === wallet}
              creator={t.wallet === meme.creator.wallet}
              flash={t.id === live.fresh}
              onPress={setSheet}
            />
          ))}
          <TradesFooter
            state={
              trades.isLoading
                ? "loading"
                : live.rows.length === 0
                  ? "empty"
                  : "rows"
            }
          />
        </View>
      </View>
      {sheet && (
        <TradeSheet
          trade={sheet}
          symbol={meme.symbol}
          bottomInset={bottomInset}
          onClose={() => setSheet(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 16, gap: 12 },
  priceRow: {
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  priceLeft: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  price: {
    fontFamily: geist.semibold,
    fontSize: 26,
    color: D.text,
    fontVariant: ["tabular-nums"],
  },
  priceUnit: { fontFamily: geist.regular, fontSize: 15, color: D.secondary },
  changeText: { fontFamily: geist.medium, fontSize: 14 },
  num: { fontVariant: ["tabular-nums"] },
  note: { fontFamily: geist.regular, fontSize: 13, color: D.muted },
  chips: { flexDirection: "row", justifyContent: "space-between" },
  chip: {
    height: 30,
    minWidth: 46,
    paddingHorizontal: 10,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: D.chipOn },
  chipText: { fontFamily: geist.medium, fontSize: 13, color: D.muted },
  chipTextOn: { color: D.bg },
  axis: {
    position: "absolute",
    fontFamily: geist.regular,
    fontSize: 10,
    color: D.muted,
    fontVariant: ["tabular-nums"],
  },
  lastPill: {
    position: "absolute",
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: D.chipOn,
    justifyContent: "center",
  },
  lastText: {
    fontFamily: geist.semibold,
    fontSize: 10,
    color: D.bg,
    fontVariant: ["tabular-nums"],
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 10,
    minHeight: 16,
  },
  legendItem: {
    fontFamily: geist.regular,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  crossPill: {
    position: "absolute",
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 4,
    backgroundColor: D.line,
    justifyContent: "center",
  },
  crossText: {
    fontFamily: geist.medium,
    fontSize: 10,
    color: D.text,
    fontVariant: ["tabular-nums"],
  },
  timeTick: {
    position: "absolute",
    fontFamily: geist.regular,
    fontSize: 10,
    color: D.muted,
    fontVariant: ["tabular-nums"],
  },
  placeholder: {
    height: CHART_H + 6 + VOL_H + AXIS_H,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: D.radius,
    borderWidth: 1,
    borderColor: D.line,
  },
  pending: { fontFamily: geist.medium, fontSize: 20, color: D.pending },
  empty: {
    fontFamily: geist.regular,
    fontSize: 14,
    color: D.secondary,
    textAlign: "center",
    paddingHorizontal: 24,
  },
});
