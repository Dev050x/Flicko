import { launchSummary, MEME_DECIMALS } from "@flicko/sdk";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";

import { geist } from "@/theme";

import { compact, formatPrice } from "./format";

/*
 * Launch curve summary (Launch meme design): a 56dp preview of the curve, start and
 * sell-out prices, then borderless rows. Every number comes from the SDK's launch math
 * (the program's own), so the screen matches the chain.
 */
const PINK = "#E5137A";
const NUM = { fontVariant: ["tabular-nums" as const] };

/*
 * Price along the curve as tokens sell: p(x) = p0 · (T0 / (T0 − x))², from x = 0 to the
 * sell-out at 0.75·T0, where it is 16·p0 (constant product with virtual reserves).
 */
const SAMPLES = 48;
const curvePoints = (width: number, height: number) => {
  const pad = 3;
  const top = 16;
  return Array.from({ length: SAMPLES + 1 }, (_, i) => {
    const share = (i / SAMPLES) * 0.75;
    const price = 1 / (1 - share) ** 2; // 1 … 16
    return {
      x: pad + (i / SAMPLES) * (width - pad * 2),
      y: height - pad - ((price - 1) / (top - 1)) * (height - pad * 2),
    };
  });
};

export function Curve({ width }: { width: number }) {
  const height = 56;
  const pts = curvePoints(width, height);
  const line = pts
    .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const last = pts[pts.length - 1];
  return (
    <Svg
      width={width}
      height={height}
      accessibilityLabel="Launch curve: price rises as people buy"
    >
      <Path
        d={`${line} L${last.x} ${height} L${pts[0].x} ${height} Z`}
        fill="rgba(229,19,122,0.12)"
      />
      <Line
        x1={0}
        y1={height - 0.5}
        x2={width}
        y2={height - 0.5}
        stroke="#1F1D26"
        strokeWidth={1}
      />
      <Path
        d={line}
        stroke={PINK}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
      <Circle cx={last.x} cy={last.y} r={3} fill={PINK} />
    </Svg>
  );
}

/** 320000 → "320K", 3200000 → "3.2M" (3 significant digits, never "319,999") */
const roundedSkr = (value: number) => {
  const [div, suffix] =
    value >= 1e9
      ? [1e9, "B"]
      : value >= 1e6
        ? [1e6, "M"]
        : value >= 1e3
          ? [1e3, "K"]
          : [1, ""];
  return `${Number((value / div).toPrecision(3))}${suffix}`;
};

export function LaunchSummary({
  supply,
  startPrice,
  symbol,
  skrDecimals,
  creatorFeeBps,
  networkFee,
  creationFee,
  burned,
  width,
}: {
  /** base units */
  supply: bigint | null;
  /** SKR base units per whole token */
  startPrice: bigint;
  symbol: string;
  skrDecimals: number;
  creatorFeeBps: number | undefined;
  /** SOL */
  networkFee: number | undefined;
  /** SKR base units, burned on launch */
  creationFee: bigint | undefined;
  /** extra SKR (whole) burned for premium filters */
  burned: { label: string; skr: number }[];
  width: number;
}) {
  let summary: ReturnType<typeof launchSummary> | null = null;
  try {
    if (supply !== null) summary = launchSummary(supply, startPrice);
  } catch {
    summary = null;
  }
  const tag = symbol ? ` $${symbol}` : "";
  const sold = summary
    ? compact(Number(summary.saleSupply / 10n ** BigInt(MEME_DECIMALS)))
    : null;
  const multiple = summary
    ? Number(summary.sellOutPrice) / Number(summary.startPrice)
    : 0;
  const free = creationFee === 0n;

  return (
    <View>
      <View style={styles.title}>
        <Text style={styles.heading}>Launch curve</Text>
        <Text style={styles.muted}>Price rises as people buy</Text>
      </View>
      <View style={{ marginTop: 10 }}>
        <Curve width={width} />
      </View>
      <View style={[styles.title, { marginTop: 8 }]}>
        <Text style={styles.muted}>
          Start{" "}
          <Text style={[styles.strong, NUM]}>
            {summary ? formatPrice(summary.startPrice, skrDecimals) : "–"}
          </Text>
        </Text>
        <Text style={styles.muted}>
          Sell-out{" "}
          <Text style={[styles.strong, NUM]}>
            {summary ? formatPrice(summary.sellOutPrice, skrDecimals) : "–"}
          </Text>
          {summary ? ` · ${Math.round(multiple)}×` : ""}
        </Text>
      </View>

      <View style={{ marginTop: 14 }}>
        <Row first label="Sold on the curve">
          {sold ? `${sold}${tag}` : "–"}
          {sold && <Text style={styles.dim}> · 80%</Text>}
        </Row>
        <Row label="Raised at sell-out">
          {summary
            ? `≈ ${roundedSkr(Number(summary.raisedAtSellOut) / 10 ** skrDecimals)} SKR`
            : "–"}
        </Row>
        <Row label="Your fee">
          {creatorFeeBps === undefined
            ? "–"
            : `${creatorFeeBps / 100}% of every trade`}
        </Row>
        <Row label="Liquidity after sell-out">Locked forever</Row>
        <Row label="Network fee">
          {networkFee === undefined
            ? "–"
            : `≈ ${Number(networkFee.toPrecision(2))} SOL`}
        </Row>
        <Row label="Creation fee" lime={free}>
          {creationFee === undefined
            ? "–"
            : free
              ? "Free"
              : `${compact(Number(creationFee) / 10 ** skrDecimals)} SKR burned`}
        </Row>
        {burned.map((b) => (
          <Row key={b.label} label={b.label}>{`${b.skr} SKR burned`}</Row>
        ))}
      </View>
    </View>
  );
}

function Row({
  label,
  first,
  lime,
  children,
}: {
  label: string;
  first?: boolean;
  lime?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.row, first && styles.rowFirst]} accessible>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, NUM, lime && { color: "#C8FF4D" }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  heading: { fontFamily: geist.semibold, fontSize: 15, color: "#F5F3F7" },
  muted: { fontFamily: geist.regular, fontSize: 12, color: "#9C98A8" },
  strong: { color: "#F5F3F7" },
  dim: { color: "#9C98A8" },
  row: {
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#1F1D26",
  },
  rowFirst: { borderTopWidth: 1, borderTopColor: "#1F1D26" },
  label: { fontFamily: geist.regular, fontSize: 14, color: "#B9B5C4" },
  value: { fontFamily: geist.regular, fontSize: 14, color: "#F5F3F7" },
});
