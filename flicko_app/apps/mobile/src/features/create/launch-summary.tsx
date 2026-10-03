import { launchSummary, MEME_DECIMALS } from "@flicko/sdk";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "@/theme";

import { compact, formatPrice, formatUnits } from "./format";

/*
 * What the launch looks like, from the SDK's launch math (the program's own math):
 * 80% sold on the curve, the sell-out price (16 x p0), the SKR raised at sell-out
 * (3.2 x p0 x S), the creator fee and the locked liquidity. Neutral card, white values.
 */
export function LaunchSummary({
  supply,
  startPrice,
  symbol,
  skrDecimals,
  creatorFeeBps,
}: {
  /** base units */
  supply: bigint | null;
  /** SKR base units per whole token */
  startPrice: bigint;
  symbol: string;
  skrDecimals: number;
  creatorFeeBps: number | undefined;
}) {
  let summary: ReturnType<typeof launchSummary> | null = null;
  try {
    if (supply !== null) summary = launchSummary(supply, startPrice);
  } catch {
    summary = null;
  }
  const tag = symbol ? ` $${symbol}` : "";
  const sold = summary
    ? `${compact(Number(summary.saleSupply / 10n ** BigInt(MEME_DECIMALS)))}${tag}`
    : "–";

  return (
    <View style={styles.card}>
      <Row label="Sold on the launch curve (80%)" value={sold} />
      <Row
        label="Price at sell-out"
        value={summary ? `${formatPrice(summary.sellOutPrice, skrDecimals)} SKR (16×)` : "–"}
      />
      <Row
        label="SKR raised at sell-out"
        value={
          summary ? `${formatUnits(summary.raisedAtSellOut, skrDecimals, 0)} SKR` : "–"
        }
      />
      <Row
        label="Your fee on every trade"
        value={creatorFeeBps === undefined ? "–" : `${creatorFeeBps / 100}%`}
      />
      <Row label="Liquidity after sell-out" value="Locked forever" />
    </View>
  );
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  label: { flexShrink: 1, fontFamily: "DMSans_400Regular", fontSize: 14, color: colors.textMuted },
  value: { fontFamily: "DMSans_700Bold", fontSize: 14, color: colors.text },
});
